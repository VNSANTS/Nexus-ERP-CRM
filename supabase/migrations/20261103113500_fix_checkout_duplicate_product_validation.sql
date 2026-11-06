-- Reassert the corrected atomic checkout definition after validating duplicate product lines.
CREATE OR REPLACE FUNCTION public.checkout_order_atomic(p_establishment_id uuid, p_cart_items jsonb, p_payment_method text, p_observacoes text, p_telefone text, p_transaction_status text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_item record;
  v_product public.products%ROWTYPE;
  v_stock integer;
  v_promo record;
  v_product_ids text[];
  v_items jsonb := '[]'::jsonb;
  v_customizations jsonb;
  v_selected_modifiers uuid[];
  v_variant_id uuid;
  v_variant record;
  v_modifier record;
  v_group record;
  v_selected_count integer;
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
      OR (item.value ? 'modifierIds' AND jsonb_typeof(item.value->'modifierIds') <> 'array')
      OR (item.value ? 'modifierIds' AND jsonb_array_length(item.value->'modifierIds') > 40)
  ) THEN
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
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.establishments e
    WHERE e.id = p_establishment_id AND e.status = 'ativo'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ESTABLISHMENT_UNAVAILABLE';
  END IF;

  SELECT array_agg(item.value->>'productId' ORDER BY item.value->>'productId')
  INTO v_product_ids
  FROM jsonb_array_elements(p_cart_items) AS item(value);

  PERFORM s.product_id
  FROM public.stock s
  JOIN public.products p ON p.id = s.product_id AND p.establishment_id = s.establishment_id
  WHERE s.establishment_id = p_establishment_id AND s.product_id = ANY(v_product_ids)
  ORDER BY s.product_id
  FOR UPDATE OF s, p;

  FOR v_item IN
    SELECT item.value->>'productId' AS product_id,
           (item.value->>'qty')::integer AS qty,
           nullif(item.value->>'variantId', '') AS variant_id,
           coalesce(item.value->'modifierIds', '[]'::jsonb) AS modifier_ids
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
    IF NOT FOUND OR v_stock < (
      SELECT sum((cart.value->>'qty')::integer)
      FROM jsonb_array_elements(p_cart_items) AS cart(value)
      WHERE cart.value->>'productId' = v_item.product_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STOCK_INSUFFICIENT';
    END IF;

    v_price := v_product.price;
    v_customizations := '[]'::jsonb;
    v_variant_id := NULL;

    IF v_item.variant_id IS NOT NULL THEN
      BEGIN v_variant_id := v_item.variant_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_VARIANT';
      END;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.product_variants pv
      WHERE pv.establishment_id = p_establishment_id AND pv.product_id = v_item.product_id AND pv.active
    ) AND v_variant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'VARIANT_REQUIRED';
    END IF;

    IF v_variant_id IS NOT NULL THEN
      SELECT pv.id, pv.name, pv.price_delta INTO v_variant
      FROM public.product_variants pv
      WHERE pv.id = v_variant_id AND pv.establishment_id = p_establishment_id
        AND pv.product_id = v_item.product_id AND pv.active;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_VARIANT'; END IF;
      v_price := v_price + v_variant.price_delta;
      v_customizations := v_customizations || jsonb_build_array(jsonb_build_object(
        'type', 'variant', 'id', v_variant.id, 'name', v_variant.name, 'priceDelta', v_variant.price_delta
      ));
    END IF;

    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_selected_modifiers
    FROM jsonb_array_elements_text(v_item.modifier_ids) AS selected(value);
    IF cardinality(v_selected_modifiers) <> jsonb_array_length(v_item.modifier_ids)
       OR (SELECT count(DISTINCT x) FROM unnest(v_selected_modifiers) x) <> cardinality(v_selected_modifiers) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MODIFIERS';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.product_modifier_groups g
      WHERE g.establishment_id = p_establishment_id AND g.product_id = v_item.product_id AND g.active
        AND (SELECT count(*)
             FROM public.product_modifiers m
             WHERE m.establishment_id = p_establishment_id AND m.product_id = v_item.product_id
               AND m.group_id = g.id AND m.active AND m.id = ANY(v_selected_modifiers)) < g.min_select
    ) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MODIFIER_SELECTION_REQUIRED'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.product_modifier_groups g
      WHERE g.establishment_id = p_establishment_id AND g.product_id = v_item.product_id AND g.active
        AND (SELECT count(*)
             FROM public.product_modifiers m
             WHERE m.establishment_id = p_establishment_id AND m.product_id = v_item.product_id
               AND m.group_id = g.id AND m.active AND m.id = ANY(v_selected_modifiers)) > g.max_select
    ) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MODIFIER_SELECTION_LIMIT'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.product_modifiers m
      WHERE m.id = ANY(v_selected_modifiers)
        AND (m.establishment_id <> p_establishment_id OR m.product_id <> v_item.product_id OR m.active = false)
    ) OR cardinality(v_selected_modifiers) <> (
      SELECT count(*) FROM public.product_modifiers m
      WHERE m.id = ANY(v_selected_modifiers) AND m.establishment_id = p_establishment_id
        AND m.product_id = v_item.product_id AND m.active
    ) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MODIFIERS'; END IF;

    FOR v_modifier IN
      SELECT m.id, m.name, m.price_delta, g.name AS group_name
      FROM public.product_modifiers m
      JOIN public.product_modifier_groups g ON g.id = m.group_id
        AND g.establishment_id = m.establishment_id AND g.product_id = m.product_id
      WHERE m.id = ANY(v_selected_modifiers) AND m.establishment_id = p_establishment_id
        AND m.product_id = v_item.product_id AND m.active AND g.active
      ORDER BY g.sort_order, m.sort_order, m.name
    LOOP
      v_price := v_price + v_modifier.price_delta;
      v_customizations := v_customizations || jsonb_build_array(jsonb_build_object(
        'type', 'modifier', 'id', v_modifier.id, 'groupName', v_modifier.group_name,
        'name', v_modifier.name, 'priceDelta', v_modifier.price_delta
      ));
    END LOOP;

    -- Promo discounts apply to the product base price; selected options are added at their configured price.
    SELECT p.tipo, p.valor INTO v_promo
    FROM public.promotions p
    WHERE p.establishment_id = p_establishment_id
      AND p.ativo = true AND p.product_ids @> ARRAY[v_item.product_id]::text[]
    ORDER BY p.created_at DESC LIMIT 1 FOR SHARE;
    IF FOUND THEN
      IF v_promo.tipo = 'percentual' THEN
        v_price := greatest(0, v_price - (v_product.price * v_promo.valor / 100));
      ELSIF v_promo.tipo = 'fixo' THEN
        v_price := greatest(0, v_price - v_promo.valor);
      END IF;
    END IF;

    v_total := v_total + v_price * v_item.qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'establishment_id', p_establishment_id, 'product_id', v_item.product_id,
      'name', v_product.name, 'price', v_price, 'qty', v_item.qty,
      'customizations', v_customizations
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

  INSERT INTO public.order_items (establishment_id, order_id, product_id, name, price, qty, customizations)
  SELECT item.establishment_id, v_order_id, item.product_id, item.name, item.price, item.qty, item.customizations
  FROM jsonb_to_recordset(v_items) AS item(
    establishment_id uuid, product_id text, name text, price numeric, qty integer, customizations jsonb
  );

  UPDATE public.stock s
  SET quantidade = s.quantidade - item.total_qty, updated_at = v_now
  FROM (
    SELECT item.product_id, sum(item.qty)::integer AS total_qty
    FROM jsonb_to_recordset(v_items) AS item(product_id text, qty integer)
    GROUP BY item.product_id
  ) AS item
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
  ) INTO v_existing
  FROM public.orders o
  WHERE o.establishment_id = p_establishment_id AND o.id = v_order_id;

  RETURN v_existing;
END;
$function$;
;

REVOKE ALL ON FUNCTION public.checkout_order_atomic(uuid, jsonb, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_order_atomic(uuid, jsonb, text, text, text, text, text) TO service_role;
