-- Public menu reads now go through pedidos?action=menu, which checks that
-- the establishment is active and scopes every result to its tenant.
-- Direct Data API reads of these tables would otherwise expose every tenant.
DROP POLICY IF EXISTS "produtos visiveis publicamente" ON public.products;
DROP POLICY IF EXISTS "promocoes ativas visiveis publicamente" ON public.promotions;
DROP POLICY IF EXISTS "settings visiveis publicamente" ON public.settings;

REVOKE ALL ON TABLE public.products, public.promotions, public.settings
  FROM anon, authenticated;

-- New public-schema tables/functions created by migrations should require
-- explicit grants. Existing objects and service_role access are unchanged.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
