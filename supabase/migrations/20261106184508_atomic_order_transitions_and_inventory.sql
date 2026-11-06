-- The Supabase CLI was unavailable in the authoring environment.
-- Both functions are backend-only and run with the caller's service-role privileges.
CREATE OR REPLACE FUNCTION public.transition_order_atomic(
  p_establishment_id uuid, p_order_id text, p_action text,
  p_status text DEFAULT NULL, p_pickup_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_next text;
  v_today timestamptz := date_trunc('day', clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF p_establishment_id IS NULL OR p_action NOT IN ('advance', 'set-status', 'pickup') OR p_action IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TRANSITION';
  END IF;
  IF p_action = 'pickup' THEN
    SELECT * INTO STRICT v_order FROM public.orders
      WHERE establishment_id = p_establishment_id AND code = p_pickup_code
        AND created_at >= v_today AND created_at < v_today + interval '1 day'
      FOR UPDATE;
  ELSE
    SELECT * INTO v_order FROM public.orders
      WHERE establishment_id = p_establishment_id AND id = p_order_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ORDER_NOT_FOUND';
  END IF;
  IF p_action = 'advance' AND p_status IS NOT NULL AND p_status IS DISTINCT FROM v_order.status THEN
    RETURN to_jsonb(v_order);
  END IF;
  v_next := CASE v_order.status WHEN 'recebido' THEN 'preparo' WHEN 'preparo' THEN 'pronto' WHEN 'pronto' THEN 'retirado' END;
  IF p_action = 'pickup' THEN
    IF v_order.status = 'retirado' THEN RETURN to_jsonb(v_order); END IF;
    IF v_order.status <> 'pronto' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORDER_NOT_READY';
    END IF;
    v_next := 'retirado';
  ELSIF p_action = 'set-status' THEN
    IF p_status = v_order.status THEN RETURN to_jsonb(v_order); END IF;
    IF p_status IS NULL OR p_status NOT IN ('preparo', 'pronto', 'retirado', 'cancelado')
      OR v_order.status IN ('retirado', 'cancelado')
      OR (p_status <> 'cancelado' AND p_status IS DISTINCT FROM v_next) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TRANSITION';
    END IF;
    v_next := p_status;
  ELSIF v_next IS NULL THEN
    RETURN to_jsonb(v_order);
  END IF;
  IF v_next = 'cancelado' THEN
    UPDATE public.transactions SET status = CASE WHEN status = 'confirmado' THEN 'estornado' ELSE 'cancelado' END
      WHERE establishment_id = p_establishment_id AND order_id = v_order.id
        AND status IN ('pendente', 'confirmado');
  END IF;
  UPDATE public.orders SET status = v_next, updated_at = clock_timestamp()
    WHERE establishment_id = p_establishment_id AND id = v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END;
$function$;
REVOKE ALL ON FUNCTION public.transition_order_atomic(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_atomic(uuid, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.move_inventory_atomic(
  p_establishment_id uuid, p_product_id text, p_action text, p_quantity integer, p_reason text
) RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_stock public.stock%ROWTYPE;
  v_entry jsonb;
  v_id text := gen_random_uuid()::text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_establishment_id IS NULL OR p_action IS NULL OR p_action NOT IN ('entry', 'waste')
    OR p_quantity IS NULL OR p_quantity < 1 OR length(coalesce(p_reason, '')) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_INVENTORY_MOVEMENT';
  END IF;
  SELECT * INTO v_stock FROM public.stock
    WHERE establishment_id = p_establishment_id AND product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOCK_NOT_FOUND'; END IF;
  IF p_action = 'waste' AND p_quantity > v_stock.quantidade THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STOCK_INSUFFICIENT';
  END IF;
  IF p_action = 'entry' AND v_stock.quantidade::bigint + p_quantity::bigint > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STOCK_LIMIT';
  END IF;
  UPDATE public.stock SET quantidade = quantidade + CASE WHEN p_action = 'entry' THEN p_quantity ELSE -p_quantity END,
    updated_at = v_now WHERE establishment_id = p_establishment_id AND product_id = p_product_id;
  IF p_action = 'entry' THEN
    INSERT INTO public.stock_history (establishment_id, id, product_id, product_name, quantidade, motivo, created_at)
      VALUES (p_establishment_id, v_id, p_product_id, v_stock.name, p_quantity, trim(coalesce(p_reason, '')), v_now)
      RETURNING to_jsonb(stock_history.*) INTO v_entry;
  ELSE
    INSERT INTO public.waste_log (establishment_id, id, product_id, product_name, quantidade, motivo, created_at)
      VALUES (p_establishment_id, v_id, p_product_id, v_stock.name, p_quantity, trim(coalesce(p_reason, '')), v_now)
      RETURNING to_jsonb(waste_log.*) INTO v_entry;
  END IF;
  RETURN v_entry;
END;
$function$;
REVOKE ALL ON FUNCTION public.move_inventory_atomic(uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_inventory_atomic(uuid, text, text, integer, text) TO service_role;

-- Preserve the current checkout definition while removing lpad truncation above 999.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.checkout_order_atomic(uuid,jsonb,text,text,text,text,text)'::regprocedure);
BEGIN
  IF position('lpad(v_count::text, 3, ''0'')' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected checkout counter definition';
  END IF;
  EXECUTE replace(definition, 'lpad(v_count::text, 3, ''0'')',
    'lpad(v_count::text, greatest(3, length(v_count::text)), ''0'')');
END;
$migration$;
