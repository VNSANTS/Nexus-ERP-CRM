-- Catalog customization schema: variants, modifier groups and modifier options.
-- Trusted Edge Functions are the only callers; tenant ownership is enforced by composite foreign keys.
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  price_delta numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_product_tenant_fkey FOREIGN KEY (product_id, establishment_id)
    REFERENCES public.products(id, establishment_id) ON DELETE CASCADE,
  CONSTRAINT product_variants_id_product_tenant_key UNIQUE (id, product_id, establishment_id)
);
CREATE TABLE public.product_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  required boolean NOT NULL DEFAULT false,
  min_select integer NOT NULL DEFAULT 0 CHECK (min_select BETWEEN 0 AND 20),
  max_select integer NOT NULL DEFAULT 1 CHECK (max_select BETWEEN 1 AND 20),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_modifier_groups_min_max_check CHECK (min_select <= max_select),
  CONSTRAINT product_modifier_groups_required_min_check CHECK (NOT required OR min_select >= 1),
  CONSTRAINT product_modifier_groups_product_tenant_fkey FOREIGN KEY (product_id, establishment_id)
    REFERENCES public.products(id, establishment_id) ON DELETE CASCADE,
  CONSTRAINT product_modifier_groups_id_product_tenant_key UNIQUE (id, product_id, establishment_id)
);
CREATE TABLE public.product_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  group_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  price_delta numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_modifiers_group_tenant_fkey FOREIGN KEY (group_id, product_id, establishment_id)
    REFERENCES public.product_modifier_groups(id, product_id, establishment_id) ON DELETE CASCADE,
  CONSTRAINT product_modifiers_id_product_group_tenant_key UNIQUE (id, group_id, product_id, establishment_id)
);
CREATE INDEX product_variants_product_active_idx ON public.product_variants (establishment_id, product_id, sort_order) WHERE active;
CREATE INDEX product_modifier_groups_product_active_idx ON public.product_modifier_groups (establishment_id, product_id, sort_order) WHERE active;
CREATE INDEX product_modifiers_group_active_idx ON public.product_modifiers (establishment_id, group_id, sort_order) WHERE active;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS customizations jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_modifiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_variants, public.product_modifier_groups, public.product_modifiers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants, public.product_modifier_groups, public.product_modifiers TO service_role;
