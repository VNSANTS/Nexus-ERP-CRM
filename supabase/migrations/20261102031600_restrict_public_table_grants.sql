-- Tighten grants on account and internal operational tables.
-- Sensitive backend workflows use service_role Edge Functions; public roles
-- should only retain the explicit self-service access required by the UI.

REVOKE ALL PRIVILEGES ON TABLE public.blocked_identifiers, public.daily_counter
  FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.customer_accounts, public.platform_admins
  FROM anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.customer_accounts TO authenticated;
GRANT SELECT ON TABLE public.platform_admins TO authenticated;

DROP POLICY IF EXISTS customer_accounts_select_own ON public.customer_accounts;
CREATE POLICY customer_accounts_select_own
  ON public.customer_accounts
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS customer_accounts_update_own ON public.customer_accounts;
CREATE POLICY customer_accounts_update_own
  ON public.customer_accounts
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS platform_admins_select_own ON public.platform_admins;
CREATE POLICY platform_admins_select_own
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);
