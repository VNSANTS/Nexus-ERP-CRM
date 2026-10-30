-- Commercial SaaS baseline: scope all operational records to an establishment.
-- The live project was audited before this migration. It has one establishment,
-- zero operational orders/products/stock/CRM rows, one settings row, and two
-- active legacy employees without an establishment link.

-- Add the tenant columns before backfilling. Keeping these separate from the
-- backfill block also makes the migration's dependency order explicit.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.stock_history ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.waste_log ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.customer_interactions ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.supply_requests ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.loyalty ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;
ALTER TABLE public.daily_counter ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE;

DO $$
DECLARE
  v_establishment_id uuid;
  v_establishment_count bigint;
BEGIN
  SELECT count(*) INTO v_establishment_count
  FROM public.establishments;

  IF v_establishment_count <> 1 THEN
    RAISE EXCEPTION 'Tenant migration requires exactly one existing establishment; found %', v_establishment_count;
  END IF;

  SELECT id INTO v_establishment_id
  FROM public.establishments
  LIMIT 1;

  UPDATE public.employees
  SET establishment_id = v_establishment_id,
      acesso_cozinha = true,
      acesso_caixa = true,
      acesso_adm = (role = 'admin')
  WHERE establishment_id IS NULL;

  UPDATE public.products SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.orders SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.order_items SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.stock SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.stock_history SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.waste_log SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.promotions SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.transactions SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.customers SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.customer_interactions SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.suppliers SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.supply_requests SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.loyalty SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.settings SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
  UPDATE public.daily_counter SET establishment_id = v_establishment_id WHERE establishment_id IS NULL;
END;
$$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_provider text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.products ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.stock ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.stock_history ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.waste_log ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.promotions ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.customer_interactions ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.suppliers ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.supply_requests ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.loyalty ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.settings ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.daily_counter ALTER COLUMN establishment_id SET NOT NULL;
ALTER TABLE public.employees ALTER COLUMN establishment_id SET NOT NULL;

ALTER TABLE public.orders ALTER COLUMN tracking_token SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_key ON public.orders (tracking_token);
CREATE UNIQUE INDEX IF NOT EXISTS orders_establishment_idempotency_key ON public.orders (establishment_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.products ADD CONSTRAINT products_id_establishment_key UNIQUE (id, establishment_id);
ALTER TABLE public.orders ADD CONSTRAINT orders_id_establishment_key UNIQUE (id, establishment_id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_id_establishment_key UNIQUE (id, establishment_id);

ALTER TABLE public.stock DROP CONSTRAINT stock_product_id_fkey;
ALTER TABLE public.stock DROP CONSTRAINT stock_pkey;
ALTER TABLE public.stock ADD CONSTRAINT stock_pkey PRIMARY KEY (establishment_id, product_id);
ALTER TABLE public.stock ADD CONSTRAINT stock_establishment_product_fkey
  FOREIGN KEY (product_id, establishment_id) REFERENCES public.products(id, establishment_id) ON DELETE CASCADE;

ALTER TABLE public.order_items DROP CONSTRAINT order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_tenant_fkey
  FOREIGN KEY (order_id, establishment_id) REFERENCES public.orders(id, establishment_id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_tenant_fkey
  FOREIGN KEY (product_id, establishment_id) REFERENCES public.products(id, establishment_id);

ALTER TABLE public.transactions ADD CONSTRAINT transactions_order_tenant_fkey
  FOREIGN KEY (order_id, establishment_id) REFERENCES public.orders(id, establishment_id) ON DELETE CASCADE;

ALTER TABLE public.supply_requests DROP CONSTRAINT supply_requests_supplier_id_fkey;
ALTER TABLE public.supply_requests ADD CONSTRAINT supply_requests_supplier_tenant_fkey
  FOREIGN KEY (supplier_id, establishment_id) REFERENCES public.suppliers(id, establishment_id) ON DELETE CASCADE;

ALTER TABLE public.customers DROP CONSTRAINT customers_pkey;
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (establishment_id, telefone);

ALTER TABLE public.customer_interactions ADD CONSTRAINT customer_interactions_customer_tenant_fkey
  FOREIGN KEY (telefone, establishment_id) REFERENCES public.customers(telefone, establishment_id) ON DELETE CASCADE;

ALTER TABLE public.loyalty DROP CONSTRAINT loyalty_pkey;
ALTER TABLE public.loyalty ADD CONSTRAINT loyalty_pkey PRIMARY KEY (establishment_id, telefone);
ALTER TABLE public.daily_counter DROP CONSTRAINT daily_counter_pkey;
ALTER TABLE public.daily_counter ADD CONSTRAINT daily_counter_pkey PRIMARY KEY (establishment_id, date);
-- The old singleton check enforces id = 1 globally, which prevents one
-- settings row with id = 1 per establishment once the composite key is used.
ALTER TABLE public.settings DROP CONSTRAINT settings_singleton;
ALTER TABLE public.settings DROP CONSTRAINT settings_pkey;
ALTER TABLE public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (establishment_id, id);

CREATE INDEX IF NOT EXISTS products_establishment_idx ON public.products (establishment_id, disponivel);
CREATE INDEX IF NOT EXISTS orders_establishment_created_idx ON public.orders (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_establishment_order_idx ON public.order_items (establishment_id, order_id);
CREATE INDEX IF NOT EXISTS transactions_establishment_created_idx ON public.transactions (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_establishment_updated_idx ON public.customers (establishment_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS customer_interactions_establishment_created_idx ON public.customer_interactions (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS suppliers_establishment_idx ON public.suppliers (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS supply_requests_establishment_created_idx ON public.supply_requests (establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employees_establishment_active_idx ON public.employees (establishment_id, ativo);

-- Public client reads of orders, order contents, loyalty records, and full
-- establishment rows expose personal or operational information. These paths
-- will be served through scoped functions after this migration.
DROP POLICY IF EXISTS "pedidos visiveis publicamente" ON public.orders;
DROP POLICY IF EXISTS "itens de pedido visiveis publicamente" ON public.order_items;
DROP POLICY IF EXISTS "fidelidade visivel publicamente" ON public.loyalty;
DROP POLICY IF EXISTS "info publica do estabelecimento visivel" ON public.establishments;

REVOKE ALL ON public.orders, public.order_items, public.loyalty, public.establishments,
  public.stock, public.stock_history, public.waste_log, public.transactions,
  public.customers, public.customer_interactions, public.suppliers,
  public.supply_requests, public.employees, public.establishment_owners,
  public.establishment_requests, public.establishment_devices, public.rate_limit_log
FROM anon, authenticated;

-- The current SECURITY DEFINER routine is executable by public roles and
-- inherits a mutable search_path. Restrict it to the backend and pin lookup.
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.rate_limit_log
  WHERE created_at < pg_catalog.now() - interval '48 hours';
$$;

REVOKE ALL ON FUNCTION public.cleanup_rate_limit_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_log() TO service_role;

