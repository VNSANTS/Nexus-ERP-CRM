CREATE INDEX IF NOT EXISTS product_variants_product_tenant_fk_idx
  ON public.product_variants (product_id, establishment_id);
CREATE INDEX IF NOT EXISTS product_modifier_groups_product_tenant_fk_idx
  ON public.product_modifier_groups (product_id, establishment_id);
CREATE INDEX IF NOT EXISTS product_modifiers_group_tenant_fk_idx
  ON public.product_modifiers (group_id, product_id, establishment_id);
