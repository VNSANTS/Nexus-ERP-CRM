CREATE OR REPLACE FUNCTION public.save_product_options(p_establishment_id uuid, p_product_id text, p_variants jsonb, p_groups jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION public.save_product_options(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_options(uuid, text, jsonb, jsonb) TO service_role;
