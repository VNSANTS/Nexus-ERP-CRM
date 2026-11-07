-- CI-ONLY SCHEMA SNAPSHOT: public schema, no table data, no user credentials.
-- Source: current Nexus ERP/CRM schema-only export before PR #10.
-- Never apply to an existing or production database; local disposable Supabase only.
-- This is NOT the historical baseline for replaying every migration.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- Local Supabase already provisions the public schema.


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

-- Supabase's existing public-schema comment is retained.


--
-- Name: checkout_order_atomic(uuid, jsonb, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.checkout_order_atomic(p_establishment_id uuid, p_cart_items jsonb, p_payment_method text, p_observacoes text, p_telefone text, p_transaction_status text, p_idempotency_key text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
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
      SELECT 1
      FROM public.product_modifiers m
      JOIN public.product_modifier_groups g ON g.id = m.group_id
        AND g.establishment_id = m.establishment_id AND g.product_id = m.product_id
      WHERE m.id = ANY(v_selected_modifiers)
        AND (m.establishment_id <> p_establishment_id OR m.product_id <> v_item.product_id
          OR m.active = false OR g.active = false)
    ) OR cardinality(v_selected_modifiers) <> (
      SELECT count(*)
      FROM public.product_modifiers m
      JOIN public.product_modifier_groups g ON g.id = m.group_id
        AND g.establishment_id = m.establishment_id AND g.product_id = m.product_id
      WHERE m.id = ANY(v_selected_modifiers) AND m.establishment_id = p_establishment_id
        AND m.product_id = v_item.product_id AND m.active AND g.active
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
        v_price := greatest(0, v_price - least(v_product.price, v_promo.valor));
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
$_$;


--
-- Name: cleanup_rate_limit_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_rate_limit_log() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  DELETE FROM public.rate_limit_log
  WHERE created_at < pg_catalog.now() - interval '48 hours';
$$;


--
-- Name: customer_insights(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_insights(p_establishment_id uuid) RETURNS TABLE(telefone text, nome text, tags text[], observacoes text, pedidos bigint, "totalGasto" numeric, "ticketMedio" numeric, "ultimoPedidoEm" timestamp with time zone, "diasSemComprar" integer, status text)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  WITH customer_candidates AS (
    SELECT
      c.telefone,
      c.nome,
      c.tags,
      c.observacoes,
      CASE
        WHEN left(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
          AND length(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')) IN (12, 13)
        THEN substr(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 3)
        ELSE pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')
      END AS phone_key,
      row_number() OVER (
        PARTITION BY CASE
          WHEN left(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
            AND length(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')) IN (12, 13)
          THEN substr(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 3)
          ELSE pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')
        END
        ORDER BY c.updated_at DESC
      ) AS row_num
    FROM public.customers c
    WHERE c.establishment_id = p_establishment_id
  ), customer_rows AS (
    SELECT * FROM customer_candidates WHERE row_num = 1 AND phone_key <> ''
  ), order_aggregates AS (
    SELECT
      CASE
        WHEN left(pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
          AND length(pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g')) IN (12, 13)
        THEN substr(pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g'), 3)
        ELSE pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g')
      END AS phone_key,
      count(*) AS pedidos,
      sum(o.total) AS total_gasto,
      max(o.created_at) AS ultimo_pedido_em
    FROM public.orders o
    WHERE o.establishment_id = p_establishment_id
      AND o.status <> 'cancelado'
      AND pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g') <> ''
    GROUP BY 1
  ), merged AS (
    SELECT
      coalesce(c.telefone, a.phone_key) AS telefone,
      coalesce(c.nome, '') AS nome,
      coalesce(c.tags, ARRAY[]::text[]) AS tags,
      coalesce(c.observacoes, '') AS observacoes,
      coalesce(a.pedidos, 0) AS pedidos,
      coalesce(a.total_gasto, 0) AS total_gasto,
      CASE WHEN coalesce(a.pedidos, 0) > 0 THEN a.total_gasto / a.pedidos ELSE 0 END AS ticket_medio,
      a.ultimo_pedido_em,
      CASE WHEN a.ultimo_pedido_em IS NOT NULL
        THEN floor(extract(epoch FROM (statement_timestamp() - a.ultimo_pedido_em)) / 86400)::integer
        ELSE NULL
      END AS dias_sem_comprar
    FROM customer_rows c
    FULL OUTER JOIN order_aggregates a USING (phone_key)
  )
  SELECT
    telefone, nome, tags, observacoes, pedidos, total_gasto, ticket_medio,
    ultimo_pedido_em, dias_sem_comprar,
    CASE
      WHEN ultimo_pedido_em IS NULL THEN 'novo'
      WHEN dias_sem_comprar > 30 THEN 'inativo'
      WHEN dias_sem_comprar > 14 THEN 'em-risco'
      ELSE 'ativo'
    END AS status
  FROM merged
  ORDER BY total_gasto DESC, nome ASC, telefone ASC;
$$;


--
-- Name: save_product_options(uuid, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_product_options(p_establishment_id uuid, p_product_id text, p_variants jsonb, p_groups jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  v_variant jsonb;
  v_group jsonb;
  v_modifier jsonb;
  v_group_id uuid;
  v_variant_count integer := 0;
  v_group_count integer := 0;
  v_modifier_count integer;
  v_min integer;
  v_max integer;
  v_name text;
BEGIN
  IF p_establishment_id IS NULL OR p_product_id IS NULL OR length(p_product_id) > 120
     OR jsonb_typeof(p_variants) <> 'array' OR jsonb_typeof(p_groups) <> 'array'
     OR jsonb_array_length(p_variants) > 20 OR jsonb_array_length(p_groups) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PRODUCT_OPTIONS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product_id AND p.establishment_id = p_establishment_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PRODUCT_NOT_FOUND';
  END IF;

  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
    v_name := btrim(coalesce(v_variant->>'name', ''));
    IF v_name = '' OR char_length(v_name) > 80
       OR coalesce(v_variant->>'priceDelta', '') !~ '^\d{1,8}(\.\d{1,2})?$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_VARIANT';
    END IF;
  END LOOP;

  FOR v_group IN SELECT value FROM jsonb_array_elements(p_groups) LOOP
    v_name := btrim(coalesce(v_group->>'name', ''));
    v_min := coalesce((v_group->>'minSelect')::integer, 0);
    v_max := coalesce((v_group->>'maxSelect')::integer, 1);
    IF v_name = '' OR char_length(v_name) > 80 OR v_min < 0 OR v_max < 1 OR v_min > v_max
       OR v_max > 20 OR coalesce(jsonb_typeof(v_group->'modifiers'), '') <> 'array'
       OR jsonb_array_length(v_group->'modifiers') > 40
       OR (coalesce((v_group->>'required')::boolean, false) AND v_min < 1)
       OR jsonb_array_length(v_group->'modifiers') < v_min THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MODIFIER_GROUP';
    END IF;
    FOR v_modifier IN SELECT value FROM jsonb_array_elements(v_group->'modifiers') LOOP
      v_name := btrim(coalesce(v_modifier->>'name', ''));
      IF v_name = '' OR char_length(v_name) > 80
         OR coalesce(v_modifier->>'priceDelta', '') !~ '^\d{1,8}(\.\d{1,2})?$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MODIFIER';
      END IF;
    END LOOP;
  END LOOP;

  DELETE FROM public.product_modifier_groups
  WHERE establishment_id = p_establishment_id AND product_id = p_product_id;
  DELETE FROM public.product_variants
  WHERE establishment_id = p_establishment_id AND product_id = p_product_id;

  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
    INSERT INTO public.product_variants (establishment_id, product_id, name, price_delta, sort_order)
    VALUES (p_establishment_id, p_product_id, btrim(v_variant->>'name'), (v_variant->>'priceDelta')::numeric, v_variant_count);
    v_variant_count := v_variant_count + 1;
  END LOOP;

  FOR v_group IN SELECT value FROM jsonb_array_elements(p_groups) LOOP
    v_group_id := gen_random_uuid();
    v_min := coalesce((v_group->>'minSelect')::integer, 0);
    v_max := coalesce((v_group->>'maxSelect')::integer, 1);
    INSERT INTO public.product_modifier_groups (
      id, establishment_id, product_id, name, required, min_select, max_select, sort_order
    ) VALUES (
      v_group_id, p_establishment_id, p_product_id, btrim(v_group->>'name'),
      coalesce((v_group->>'required')::boolean, false), v_min, v_max, v_group_count
    );
    v_modifier_count := 0;
    FOR v_modifier IN SELECT value FROM jsonb_array_elements(v_group->'modifiers') LOOP
      INSERT INTO public.product_modifiers (
        establishment_id, product_id, group_id, name, price_delta, sort_order
      ) VALUES (
        p_establishment_id, p_product_id, v_group_id, btrim(v_modifier->>'name'),
        (v_modifier->>'priceDelta')::numeric, v_modifier_count
      );
      v_modifier_count := v_modifier_count + 1;
    END LOOP;
    v_group_count := v_group_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'variants', v_variant_count, 'groups', v_group_count);
END;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: blocked_identifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_identifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    valor text NOT NULL,
    contexto text DEFAULT 'establishment_request'::text NOT NULL,
    motivo text,
    blocked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blocked_identifiers_contexto_check CHECK ((contexto = ANY (ARRAY['establishment_request'::text, 'customer'::text]))),
    CONSTRAINT blocked_identifiers_tipo_check CHECK ((tipo = ANY (ARRAY['cpf_cnpj'::text, 'email'::text])))
);


--
-- Name: customer_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_accounts (
    id uuid NOT NULL,
    nome text,
    email text NOT NULL,
    telefone text,
    telefone_whatsapp boolean DEFAULT false NOT NULL,
    cpf text,
    endereco_cep text,
    endereco_logradouro text,
    endereco_numero text,
    endereco_complemento text,
    endereco_bairro text,
    endereco_cidade text,
    endereco_uf text,
    cadastro_completo boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_interactions (
    id text NOT NULL,
    telefone text NOT NULL,
    tipo text NOT NULL,
    nota text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    telefone text NOT NULL,
    nome text DEFAULT ''::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: daily_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_counter (
    date text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid NOT NULL,
    nome text NOT NULL,
    username text NOT NULL,
    role text DEFAULT 'funcionario'::text NOT NULL,
    horario text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL,
    acesso_cozinha boolean DEFAULT false NOT NULL,
    acesso_caixa boolean DEFAULT false NOT NULL,
    acesso_adm boolean DEFAULT false NOT NULL,
    auth_user_id uuid,
    acesso_crm boolean DEFAULT false NOT NULL,
    acesso_relatorios boolean DEFAULT false NOT NULL,
    acesso_estoque boolean DEFAULT true NOT NULL,
    acesso_fornecedores boolean DEFAULT false NOT NULL,
    acesso_produtos boolean DEFAULT false NOT NULL,
    acesso_promocoes boolean DEFAULT false NOT NULL,
    acesso_funcionarios boolean DEFAULT false NOT NULL,
    acesso_configuracoes boolean DEFAULT false NOT NULL,
    acesso_dispositivos boolean DEFAULT false NOT NULL
);


--
-- Name: establishment_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    codigo text NOT NULL,
    apelido text,
    password_hash text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    revoked_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: establishment_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_owners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    nome_completo text NOT NULL,
    email text NOT NULL,
    telefone text NOT NULL,
    cpf_cnpj text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    acesso_cozinha boolean DEFAULT true NOT NULL,
    acesso_caixa boolean DEFAULT true NOT NULL,
    acesso_adm boolean DEFAULT true NOT NULL,
    acesso_crm boolean DEFAULT true NOT NULL,
    acesso_relatorios boolean DEFAULT true NOT NULL,
    acesso_estoque boolean DEFAULT true NOT NULL,
    acesso_fornecedores boolean DEFAULT true NOT NULL,
    acesso_produtos boolean DEFAULT true NOT NULL,
    acesso_promocoes boolean DEFAULT true NOT NULL,
    acesso_funcionarios boolean DEFAULT true NOT NULL,
    acesso_configuracoes boolean DEFAULT true NOT NULL,
    acesso_dispositivos boolean DEFAULT true NOT NULL
);


--
-- Name: establishment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_nome text NOT NULL,
    owner_email text NOT NULL,
    owner_telefone text NOT NULL,
    owner_cpf_cnpj text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    decided_at timestamp with time zone,
    decided_by text,
    rejection_reason text,
    establishment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    endereco_cep text,
    endereco_logradouro text,
    endereco_numero text,
    endereco_complemento text,
    endereco_bairro text,
    endereco_cidade text,
    endereco_uf text
);


--
-- Name: establishments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome_completo text NOT NULL,
    apelido text NOT NULL,
    email text NOT NULL,
    cpf_cnpj text NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    onboarding_completo boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    endereco_cep text,
    endereco_logradouro text,
    endereco_numero text,
    endereco_complemento text,
    endereco_bairro text,
    endereco_cidade text,
    endereco_uf text
);


--
-- Name: loyalty; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty (
    telefone text NOT NULL,
    pedidos integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id text NOT NULL,
    product_id text NOT NULL,
    name text NOT NULL,
    price numeric(10,2) NOT NULL,
    qty integer NOT NULL,
    establishment_id uuid NOT NULL,
    customizations jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id text NOT NULL,
    code text NOT NULL,
    payment_code text NOT NULL,
    total numeric(10,2) NOT NULL,
    payment_method text NOT NULL,
    status text DEFAULT 'recebido'::text NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL,
    tracking_token uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id uuid NOT NULL,
    nome text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_super_admin boolean DEFAULT false NOT NULL
);


--
-- Name: product_modifier_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_modifier_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    product_id text NOT NULL,
    name text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    min_select integer DEFAULT 0 NOT NULL,
    max_select integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_modifier_groups_max_select_check CHECK (((max_select >= 1) AND (max_select <= 20))),
    CONSTRAINT product_modifier_groups_min_max_check CHECK ((min_select <= max_select)),
    CONSTRAINT product_modifier_groups_min_select_check CHECK (((min_select >= 0) AND (min_select <= 20))),
    CONSTRAINT product_modifier_groups_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80))),
    CONSTRAINT product_modifier_groups_required_min_check CHECK (((NOT required) OR (min_select >= 1)))
);


--
-- Name: product_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_modifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    product_id text NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    price_delta numeric(12,2) DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_modifiers_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80))),
    CONSTRAINT product_modifiers_price_delta_check CHECK ((price_delta >= (0)::numeric))
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establishment_id uuid NOT NULL,
    product_id text NOT NULL,
    name text NOT NULL,
    price_delta numeric(12,2) DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_variants_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80))),
    CONSTRAINT product_variants_price_delta_check CHECK ((price_delta >= (0)::numeric))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id text NOT NULL,
    name text NOT NULL,
    price numeric(10,2) NOT NULL,
    emoji text NOT NULL,
    categoria text NOT NULL,
    sazonal boolean DEFAULT false NOT NULL,
    disponivel boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    establishment_id uuid NOT NULL,
    description text DEFAULT ''::text NOT NULL
);


--
-- Name: COLUMN products.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.description IS 'Descrição opcional exibida no cardápio público; limite de 500 caracteres validado pela Edge Function.';


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id text NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    valor numeric(10,2) NOT NULL,
    product_ids text[] DEFAULT '{}'::text[] NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: rate_limit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_log (
    id bigint NOT NULL,
    scope text NOT NULL,
    identifier text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rate_limit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id integer DEFAULT 1 NOT NULL,
    nome_loja text DEFAULT 'Cantinas Nexus'::text NOT NULL,
    whatsapp_numero text DEFAULT '5511999999999'::text NOT NULL,
    establishment_id uuid NOT NULL,
    logo_url text,
    menu_primary_color text DEFAULT '#ff6600'::text NOT NULL,
    menu_background_color text DEFAULT '#f7f3ed'::text NOT NULL
);


--
-- Name: stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock (
    product_id text NOT NULL,
    name text NOT NULL,
    quantidade integer DEFAULT 0 NOT NULL,
    minimo integer DEFAULT 5 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: stock_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_history (
    id text NOT NULL,
    product_id text NOT NULL,
    product_name text NOT NULL,
    quantidade integer NOT NULL,
    motivo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id text NOT NULL,
    nome text NOT NULL,
    contato text NOT NULL,
    telefone text NOT NULL,
    email text NOT NULL,
    insumos text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: supply_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supply_requests (
    id text NOT NULL,
    supplier_id text NOT NULL,
    insumo text NOT NULL,
    quantidade text NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id text NOT NULL,
    order_id text NOT NULL,
    order_code text NOT NULL,
    method text NOT NULL,
    valor numeric(10,2) NOT NULL,
    status text DEFAULT 'confirmado'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL,
    payment_provider text,
    provider_payment_id text,
    paid_at timestamp with time zone,
    confirmed_by uuid
);


--
-- Name: waste_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waste_log (
    id text NOT NULL,
    product_id text NOT NULL,
    product_name text NOT NULL,
    quantidade integer NOT NULL,
    motivo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    establishment_id uuid NOT NULL
);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: blocked_identifiers blocked_identifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_identifiers
    ADD CONSTRAINT blocked_identifiers_pkey PRIMARY KEY (id);


--
-- Name: blocked_identifiers blocked_identifiers_tipo_valor_contexto_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_identifiers
    ADD CONSTRAINT blocked_identifiers_tipo_valor_contexto_key UNIQUE (tipo, valor, contexto);


--
-- Name: customer_accounts customer_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_pkey PRIMARY KEY (id);


--
-- Name: customer_interactions customer_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_interactions
    ADD CONSTRAINT customer_interactions_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (establishment_id, telefone);


--
-- Name: daily_counter daily_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_counter
    ADD CONSTRAINT daily_counter_pkey PRIMARY KEY (establishment_id, date);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_username_key UNIQUE (username);


--
-- Name: establishment_devices establishment_devices_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_devices
    ADD CONSTRAINT establishment_devices_codigo_key UNIQUE (codigo);


--
-- Name: establishment_devices establishment_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_devices
    ADD CONSTRAINT establishment_devices_pkey PRIMARY KEY (id);


--
-- Name: establishment_owners establishment_owners_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_owners
    ADD CONSTRAINT establishment_owners_email_key UNIQUE (email);


--
-- Name: establishment_owners establishment_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_owners
    ADD CONSTRAINT establishment_owners_pkey PRIMARY KEY (id);


--
-- Name: establishment_requests establishment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_requests
    ADD CONSTRAINT establishment_requests_pkey PRIMARY KEY (id);


--
-- Name: establishments establishments_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_email_key UNIQUE (email);


--
-- Name: establishments establishments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT establishments_pkey PRIMARY KEY (id);


--
-- Name: loyalty loyalty_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty
    ADD CONSTRAINT loyalty_pkey PRIMARY KEY (establishment_id, telefone);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_id_establishment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_id_establishment_key UNIQUE (id, establishment_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: product_modifier_groups product_modifier_groups_id_product_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_modifier_groups
    ADD CONSTRAINT product_modifier_groups_id_product_tenant_key UNIQUE (id, product_id, establishment_id);


--
-- Name: product_modifier_groups product_modifier_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_modifier_groups
    ADD CONSTRAINT product_modifier_groups_pkey PRIMARY KEY (id);


--
-- Name: product_modifiers product_modifiers_id_product_group_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_modifiers
    ADD CONSTRAINT product_modifiers_id_product_group_tenant_key UNIQUE (id, group_id, product_id, establishment_id);


--
-- Name: product_modifiers product_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_modifiers
    ADD CONSTRAINT product_modifiers_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_id_product_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_id_product_tenant_key UNIQUE (id, product_id, establishment_id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_id_establishment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_id_establishment_key UNIQUE (id, establishment_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_log rate_limit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_log
    ADD CONSTRAINT rate_limit_log_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (establishment_id, id);


--
-- Name: stock_history stock_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_history
    ADD CONSTRAINT stock_history_pkey PRIMARY KEY (id);


--
-- Name: stock stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_pkey PRIMARY KEY (establishment_id, product_id);


--
-- Name: suppliers suppliers_id_establishment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_id_establishment_key UNIQUE (id, establishment_id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: supply_requests supply_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_requests
    ADD CONSTRAINT supply_requests_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: waste_log waste_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_log
    ADD CONSTRAINT waste_log_pkey PRIMARY KEY (id);


--
-- Name: blocked_identifiers_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blocked_identifiers_lookup_idx ON public.blocked_identifiers USING btree (tipo, valor, contexto);


--
-- Name: customer_accounts_cpf_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_accounts_cpf_unique ON public.customer_accounts USING btree (cpf) WHERE (cpf IS NOT NULL);


--
-- Name: customer_accounts_telefone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_accounts_telefone_unique ON public.customer_accounts USING btree (telefone) WHERE (telefone IS NOT NULL);


--
-- Name: customer_interactions_establishment_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_interactions_establishment_created_idx ON public.customer_interactions USING btree (establishment_id, created_at DESC);


--
-- Name: customers_establishment_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_establishment_updated_idx ON public.customers USING btree (establishment_id, updated_at DESC);


--
-- Name: employees_auth_user_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_auth_user_id_unique ON public.employees USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);


--
-- Name: employees_establishment_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_establishment_active_idx ON public.employees USING btree (establishment_id, ativo);


--
-- Name: employees_establishment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_establishment_id_idx ON public.employees USING btree (establishment_id);


--
-- Name: establishment_devices_establishment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX establishment_devices_establishment_id_idx ON public.establishment_devices USING btree (establishment_id);


--
-- Name: idx_establishment_owners_establishment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_establishment_owners_establishment ON public.establishment_owners USING btree (establishment_id);


--
-- Name: idx_establishment_requests_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_establishment_requests_expires ON public.establishment_requests USING btree (expires_at);


--
-- Name: idx_establishment_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_establishment_requests_status ON public.establishment_requests USING btree (status);


--
-- Name: idx_rate_limit_scope_identifier_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_scope_identifier_time ON public.rate_limit_log USING btree (scope, identifier, created_at);


--
-- Name: order_items_establishment_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_establishment_order_idx ON public.order_items USING btree (establishment_id, order_id);


--
-- Name: orders_establishment_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_establishment_created_idx ON public.orders USING btree (establishment_id, created_at DESC);


--
-- Name: orders_establishment_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_establishment_idempotency_key ON public.orders USING btree (establishment_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: orders_tracking_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_tracking_token_key ON public.orders USING btree (tracking_token);


--
-- Name: product_modifier_groups_product_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_modifier_groups_product_active_idx ON public.product_modifier_groups USING btree (establishment_id, product_id, sort_order) WHERE active;


--
-- Name: product_modifier_groups_product_tenant_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_modifier_groups_product_tenant_fk_idx ON public.product_modifier_groups USING btree (product_id, establishment_id);


--
-- Name: product_modifiers_group_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_modifiers_group_active_idx ON public.product_modifiers USING btree (establishment_id, group_id, sort_order) WHERE active;


--
-- Name: product_modifiers_group_tenant_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_modifiers_group_tenant_fk_idx ON public.product_modifiers USING btree (group_id, product_id, establishment_id);


--
-- Name: product_variants_product_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variants_product_active_idx ON public.product_variants USING btree (establishment_id, product_id, sort_order) WHERE active;


--
-- Name: product_variants_product_tenant_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variants_product_tenant_fk_idx ON public.product_variants USING btree (product_id, establishment_id);


--
-- Name: products_establishment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_establishment_idx ON public.products USING btree (establishment_id, disponivel);


--
-- Name: rate_limit_log_scope_identifier_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limit_log_scope_identifier_created_at_idx ON public.rate_limit_log USING btree (scope, identifier, created_at);


--
-- Name: suppliers_establishment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_establishment_idx ON public.suppliers USING btree (establishment_id, created_at DESC);


--
-- Name: supply_requests_establishment_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supply_requests_establishment_created_idx ON public.supply_requests USING btree (establishment_id, created_at DESC);


--
-- Name: transactions_establishment_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_establishment_created_idx ON public.transactions USING btree (establishment_id, created_at DESC);


--
-- Name: blocked_identifiers blocked_identifiers_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_identifiers
    ADD CONSTRAINT blocked_identifiers_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.platform_admins(id);


--
-- Name: customer_accounts customer_accounts_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: customer_interactions customer_interactions_customer_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_interactions
    ADD CONSTRAINT customer_interactions_customer_tenant_fkey FOREIGN KEY (telefone, establishment_id) REFERENCES public.customers(telefone, establishment_id) ON DELETE CASCADE;


--
-- Name: customer_interactions customer_interactions_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_interactions
    ADD CONSTRAINT customer_interactions_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: customers customers_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: daily_counter daily_counter_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_counter
    ADD CONSTRAINT daily_counter_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: employees employees_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: employees employees_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: employees employees_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: establishment_devices establishment_devices_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_devices
    ADD CONSTRAINT establishment_devices_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_owners establishment_owners_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_owners
    ADD CONSTRAINT establishment_owners_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_requests establishment_requests_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_requests
    ADD CONSTRAINT establishment_requests_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id);


--
-- Name: loyalty loyalty_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty
    ADD CONSTRAINT loyalty_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_tenant_fkey FOREIGN KEY (order_id, establishment_id) REFERENCES public.orders(id, establishment_id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_tenant_fkey FOREIGN KEY (product_id, establishment_id) REFERENCES public.products(id, establishment_id);


--
-- Name: orders orders_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: platform_admins platform_admins_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_modifier_groups product_modifier_groups_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_modifier_groups
    ADD CONSTRAINT product_modifier_groups_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: product_modifier_groups product_modifier_groups_product_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_modifier_groups
    ADD CONSTRAINT product_modifier_groups_product_tenant_fkey FOREIGN KEY (product_id, establishment_id) REFERENCES public.products(id, establishment_id) ON DELETE CASCADE;


--
-- Name: product_modifiers product_modifiers_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_modifiers
    ADD CONSTRAINT product_modifiers_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: product_modifiers product_modifiers_group_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_modifiers
    ADD CONSTRAINT product_modifiers_group_tenant_fkey FOREIGN KEY (group_id, product_id, establishment_id) REFERENCES public.product_modifier_groups(id, product_id, establishment_id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_tenant_fkey FOREIGN KEY (product_id, establishment_id) REFERENCES public.products(id, establishment_id) ON DELETE CASCADE;


--
-- Name: products products_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: promotions promotions_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: settings settings_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: stock stock_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: stock stock_establishment_product_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_establishment_product_fkey FOREIGN KEY (product_id, establishment_id) REFERENCES public.products(id, establishment_id) ON DELETE CASCADE;


--
-- Name: stock_history stock_history_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_history
    ADD CONSTRAINT stock_history_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: supply_requests supply_requests_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_requests
    ADD CONSTRAINT supply_requests_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: supply_requests supply_requests_supplier_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_requests
    ADD CONSTRAINT supply_requests_supplier_tenant_fkey FOREIGN KEY (supplier_id, establishment_id) REFERENCES public.suppliers(id, establishment_id) ON DELETE CASCADE;


--
-- Name: transactions transactions_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_order_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_order_tenant_fkey FOREIGN KEY (order_id, establishment_id) REFERENCES public.orders(id, establishment_id) ON DELETE CASCADE;


--
-- Name: waste_log waste_log_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_log
    ADD CONSTRAINT waste_log_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: blocked_identifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocked_identifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_accounts customer_accounts_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_accounts_select_own ON public.customer_accounts FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: customer_accounts customer_accounts_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_accounts_update_own ON public.customer_accounts FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: customer_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: establishment_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishment_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: establishment_owners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishment_owners ENABLE ROW LEVEL SECURITY;

--
-- Name: establishment_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishment_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: establishments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins platform_admins_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_admins_select_own ON public.platform_admins FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: product_modifier_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_modifier_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: product_modifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: supply_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supply_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: waste_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waste_log ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--
