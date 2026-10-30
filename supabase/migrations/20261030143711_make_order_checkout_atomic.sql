-- All order side effects run in one PostgreSQL transaction. Row locks prevent
-- concurrent checkouts from overselling stock; an advisory lock makes retries
-- with the same idempotency key return the original order.
CREATE OR REPLACE FUNCTION public.checkout_order_atomic(
  p_establishment_id uuid,
  p_cart_items jsonb,
  p_payment_method text,
  p_observacoes text,
  p_telefone text,
  p_transaction_status text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item record;
  v_product public.products%ROWTYPE;
  v_stock integer;
  v_promo record;
  v_product_ids text[];
  v_items jsonb := '[]'::jsonb;
  v_order_id text;
  v_order_code text;
  v_payment_code text;
  v_count integer;
  v_total numeric := 0;
  v_price numeric;
  v_now timestamptz := clock_timestamp();
  v_today text;
  v_existing jsonb;
BEGIN
  IF p_establishment_id IS NULL OR p_transaction_status IS NULL OR p_transaction_status NOT IN ('pendente', 'confirmado') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ORDER';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('pix', 'credito', 'debito', 'dinheiro') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PAYMENT_METHOD';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 16 OR length(p_idempotency_key) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF p_cart_items IS NULL OR jsonb_typeof(p_cart_items) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CART';
  END IF;
  IF jsonb_array_length(p_cart_items) < 1 OR jsonb_array_length(p_cart_items) > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CART';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_cart_items) AS item(value)
    WHERE coalesce(item.value->>'productId', '') = ''
      OR length(item.value->>'productId') > 120
      OR NOT CASE
        WHEN coalesce(item.value->>'qty', '') ~ '^[0-9]+$' AND length(item.value->>'qty') <= 3
          THEN (item.value->>'qty')::integer BETWEEN 1 AND 100
        ELSE false
      END
  ) OR (
    SELECT count(DISTINCT item.value->>'productId')
    FROM jsonb_array_elements(p_cart_items) AS item(value)
  ) <> jsonb_array_length(p_cart_items) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CART';
  END IF;
  IF length(coalesce(p_observacoes, '')) > 500 OR length(coalesce(p_telefone, '')) > 30 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CUSTOMER_DATA';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_establishment_id::text || ':' || p_idempotency_key, 0));
  SELECT to_jsonb(o) || jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id)
                       FROM public.order_items oi
                       WHERE oi.establishment_id = o.establishment_id AND oi.order_id = o.id), '[]'::jsonb)
  )
  INTO v_existing
  FROM public.orders o
  WHERE o.establishment_id = p_establishment_id AND o.idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.establishments e
    WHERE e.id = p_establishment_id AND e.status = 'ativo'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ESTABLISHMENT_UNAVAILABLE';
  END IF;

  SELECT array_agg(item.value->>'productId' ORDER BY item.value->>'productId')
  INTO v_product_ids
  FROM jsonb_array_elements(p_cart_items) AS item(value);

  -- Lock product and stock rows in a stable order to avoid deadlocks.
  PERFORM s.product_id
  FROM public.stock s
  JOIN public.products p
    ON p.id = s.product_id AND p.establishment_id = s.establishment_id
  WHERE s.establishment_id = p_establishment_id
    AND s.product_id = ANY(v_product_ids)
  ORDER BY s.product_id
  FOR UPDATE OF s, p;

  FOR v_item IN
    SELECT item.value->>'productId' AS product_id, (item.value->>'qty')::integer AS qty
    FROM jsonb_array_elements(p_cart_items) AS item(value)
    ORDER BY item.value->>'productId'
  LOOP
    SELECT * INTO v_product
    FROM public.products p
    WHERE p.establishment_id = p_establishment_id
      AND p.id = v_item.product_id
      AND p.disponivel = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRODUCT_UNAVAILABLE';
    END IF;

    SELECT s.quantidade INTO v_stock
    FROM public.stock s
    WHERE s.establishment_id = p_establishment_id AND s.product_id = v_item.product_id;
    IF NOT FOUND OR v_stock < v_item.qty THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STOCK_INSUFFICIENT';
    END IF;

    v_price := v_product.price;
    SELECT p.tipo, p.valor INTO v_promo
    FROM public.promotions p
    WHERE p.establishment_id = p_establishment_id
      AND p.ativo = true
      AND p.product_ids @> ARRAY[v_item.product_id]::text[]
    ORDER BY p.created_at DESC
    LIMIT 1
    FOR SHARE;
    IF FOUND THEN
      IF v_promo.tipo = 'percentual' THEN
        v_price := greatest(0, v_price * (1 - v_promo.valor / 100));
      ELSIF v_promo.tipo = 'fixo' THEN
        v_price := greatest(0, v_price - v_promo.valor);
      END IF;
    END IF;

    v_total := v_total + v_price * v_item.qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'establishment_id', p_establishment_id,
      'product_id', v_item.product_id,
      'name', v_product.name,
      'price', v_price,
      'qty', v_item.qty
    ));
  END LOOP;

  v_today := to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');
  INSERT INTO public.daily_counter (establishment_id, date, count)
  VALUES (p_establishment_id, v_today, 1)
  ON CONFLICT (establishment_id, date)
  DO UPDATE SET count = public.daily_counter.count + 1
  RETURNING count INTO v_count;

  v_order_id := gen_random_uuid()::text;
  v_order_code := lpad(v_count::text, 3, '0');
  v_payment_code := 'PAG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.orders (
    establishment_id, id, idempotency_key, code, payment_code, total,
    payment_method, status, observacoes, telefone, created_at, updated_at
  ) VALUES (
    p_establishment_id, v_order_id, p_idempotency_key, v_order_code, v_payment_code, v_total,
    p_payment_method, 'recebido', trim(coalesce(p_observacoes, '')),
    trim(coalesce(p_telefone, '')), v_now, v_now
  );

  INSERT INTO public.order_items (establishment_id, order_id, product_id, name, price, qty)
  SELECT item.establishment_id, v_order_id, item.product_id, item.name, item.price, item.qty
  FROM jsonb_to_recordset(v_items) AS item(
    establishment_id uuid, product_id text, name text, price numeric, qty integer
  );

  UPDATE public.stock s
  SET quantidade = s.quantidade - item.qty, updated_at = v_now
  FROM jsonb_to_recordset(v_items) AS item(product_id text, qty integer)
  WHERE s.establishment_id = p_establishment_id AND s.product_id = item.product_id;

  INSERT INTO public.transactions (
    establishment_id, id, order_id, order_code, method, valor, status, created_at
  ) VALUES (
    p_establishment_id, gen_random_uuid()::text, v_order_id, v_order_code,
    p_payment_method, v_total, p_transaction_status, v_now
  );

  IF nullif(trim(coalesce(p_telefone, '')), '') IS NOT NULL THEN
    INSERT INTO public.loyalty (establishment_id, telefone, pedidos, updated_at)
    VALUES (p_establishment_id, trim(p_telefone), 1, v_now)
    ON CONFLICT (establishment_id, telefone)
    DO UPDATE SET pedidos = public.loyalty.pedidos + 1, updated_at = v_now;
  END IF;

  SELECT to_jsonb(o) || jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id)
                       FROM public.order_items oi
                       WHERE oi.establishment_id = o.establishment_id AND oi.order_id = o.id), '[]'::jsonb)
  )
  INTO v_existing
  FROM public.orders o
  WHERE o.establishment_id = p_establishment_id AND o.id = v_order_id;

  RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_order_atomic(uuid, jsonb, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_order_atomic(uuid, jsonb, text, text, text, text, text)
  TO service_role;
