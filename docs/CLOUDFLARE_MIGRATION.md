# Nexus ERP/CRM — Cloudflare migration handoff

Updated: 2026-11-07. Current stage: **frontend staging online; backend production release gated**.

## Hosting already configured

- Cloudflare Pages project: `nexus-erp-crm-staging`
- URL: https://nexus-erp-crm-staging.pages.dev/
- Source: GitHub `VNSANTS/Nexus-ERP-CRM`, branch `deploy/cloudflare-workers`
- Build root: repository root
- Build command: `pnpm --filter @workspace/cantinas-nexus run build`
- Build output: `artifacts/cantinas-nexus/dist/public`
- Environment: `NODE_VERSION=22`, `BASE_PATH=/`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase **publishable**, safe for a public frontend; no service key). Turnstile site key must be configured for any new hostname if that feature is enabled.
- No additional paid Cloudflare product or extra Supabase project has been created.
- Cloudflare automatic builds are enabled for the **isolated staging branch** `deploy/cloudflare-workers` only. The final production release stays gated behind backup and backend migration.
- Existing GitHub Pages and `main` remain unchanged; **do not merge this branch prematurely** because it removes the GitHub-specific `404.html` workaround.

The first Cloudflare deployment failed because its build command tried to reinstall pnpm globally where it already existed. After removing the duplicate install, the deployment completed and uploaded 51 files with valid `_headers` rules.

## Verified (real GitHub Actions evidence)

- [Live Cloudflare HTTPS routes and security headers](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42374983671): pass. Direct routes `/`, `/cozinha`, `/acompanhar/...` and module assets served. Staging `noindex`, `nosniff`, `X-Frame-Options: DENY` checked.
- [Real Chromium browser against hosted Cloudflare frontend](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42376414571): pass. Menu, payment-at-cashier UX, order screen, cashier and administrative UI tested with **synthetic intercepted API responses**. No production data modified.
- [Backend integrity and strict CORS middleware](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42376043818): pass. PostgreSQL integrity, 6 origin/preflight tests and Deno typecheck of all 25 Edge Functions.
- [Disposable local Supabase Auth/HTTP/E2E](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42376043828): pass. Not a substitute for a controlled production migration.

## CORS security

- `supabase/functions/_shared/cors.ts` defines exact allowed browser origins: legacy GitHub Pages, Cloudflare staging and designated local development/test origins. No `*` and no arbitrary `*.pages.dev` or attacker-controlled origin reflection.
- All 25 Edge Functions use `withCors(req, handler)`. It returns origin-specific CORS headers even on authentication errors; preflight from unknown origins is rejected; legacy hard-coded GitHub origin headers are removed from final responses.
- CORS is **not authorization**. JWT, tenant-level access control, API rate limiting and RLS must be preserved. Never expose `service_role` or `sb_secret_...` to the browser.
- The **deployed production Edge Functions still contain the old origin policy**. Until the source changes are deployed, browser requests from Cloudflare may be blocked even though the frontend and its mocked browser smoke pass.

## Supabase Auth redirects

- Frontend recovery and signup callbacks use the current browser origin plus Vite's `BASE_URL`. Keep the Pages build base at `/Nexus-ERP-CRM/` and the Cloudflare Pages base at `/`.
- Owner invitations and recovery callbacks from Edge Functions use the requesting origin only when it exactly matches the shared CORS allowlist. GitHub Pages receives its repository base path; Cloudflare receives `/`. The public establishment request email links to the actual `/nxs` admin route.
- In Supabase **Authentication → URL Configuration**, add exact redirect URLs for each active environment (currently `https://vnsants.github.io/Nexus-ERP-CRM/` and `https://nexus-erp-crm-staging.pages.dev/`). Do not use broad wildcard domains. Keep the Site URL on the currently approved canonical site until the production hostname is selected and cutover is approved.
- If a trusted server-to-server caller needs an Auth link without an `Origin` header, configure `NEXUS_PUBLIC_APP_URL` in the Edge Function secrets to an origin already present in the shared allowlist. Do not use a user-supplied URL. Add a future production origin to the allowlist and Auth redirect list only as part of the approved cutover.
- Owner invitation callbacks return to the app root. The app captures the Supabase `type=invite` callback before the Auth client consumes it and routes the session to `/estabelecimento/onboarding`.

## Continuity checkpoint — 2026-11-09

- Updated references from GitHub. `origin/main` is `7d5697e`; PR #10 is closed and PR #11 remains open. The PR branch is `deploy/cloudflare-workers` at `50ab5c9`, has `main` as an ancestor, and was clean and up to date before this checkpoint. Local Playwright work and the two pre-existing uncommitted files on `codex/auditoria-playwright` remain untouched.
- Auth callback and admin notification links now follow the allowlisted request origin and the active Vite base path. Added regression cases for GitHub Pages, Cloudflare staging and rejecting an untrusted origin. The `/nxs` route still requires a live Auth session plus a `platform_admins` row; sensitive Edge Function actions check the same table.
- Validation on this Windows host: frontend TypeScript check passed using the existing compiler; Cloudflare root build passed; 8 CORS/redirect cases passed using Node 24. Local Deno is unavailable, so the all-functions Deno typecheck must be confirmed by CI after this branch update. No authenticated production-browser smoke test was run.
- Supabase read-only inventory: PostgreSQL `17.6.1.166`; 16 applied migrations versus 17 versioned locally, with `20261106184508_atomic_order_transitions_and_inventory.sql` still pending. Auth has 3 users; Storage has 1 bucket and 1 object. `pg_cron` and `supabase_vault` are installed; one cron job exists and the Vault secrets table has zero records. These counts do not include Edge Function secret values, Auth configuration, or the physical Storage object contents.
- `order_items_id_seq` and `rate_limit_log_id_seq` currently grant USAGE to `anon` and `authenticated`. This must be reviewed and corrected in the approved production release plan; this checkpoint made no database change.
- **Backup and restore remain blocked.** No archive with restore evidence was found in the repository or examined common folders. `psql`, `pg_dump`, `pg_restore`, Docker and Deno are not installed/on PATH. A PostgreSQL 18.6 installer exists locally, but it is not PostgreSQL 17 and was not run. No private production dump, Storage object copy, checksum set or isolated restore has been produced.
- No migration, Edge Function deployment, Supabase Auth setting, Cloudflare production change, Pages retirement, repository visibility change or merge was performed. The PR #11 production gates remain closed until backup and isolated restore are proven.

## Gates before switching customers to Cloudflare

1. Save a private schema-and-data backup of the actual Supabase production database; inspect the archive and **prove restoration in a separate isolated PostgreSQL instance**. Never commit a dump, credentials, Auth users or customer data.
2. Confirm production migration history (16 applied), take a recovery checkpoint and apply **only** pending migration `20261106184508_atomic_order_transitions_and_inventory.sql` after backup verification. Do not reset the linked database or mark migrations applied without verifying effects.
3. Deploy the compatible Edge Functions with strict CORS, preserving each function's existing `verify_jwt` behavior, secrets and ownership rules. Perform synthetic, authorized smoke checks of store separation, orders, inventory, kitchen and cashier. Do not disable authorization to fix CORS.
4. Confirm Supabase Auth redirect allowlist, Turnstile settings and any public hostname configuration. Test browser login, requests, tracking and manual payment confirmation using synthetic data. Remove `noindex` only after readiness.
5. Enable production deployment to the final Cloudflare hostname and verify it. **Then** retire GitHub Pages and change GitHub repo visibility to private (test continued Cloudflare Git access first); do not remove the last working site before cutover.
6. Monitor after cutover; preserve the previous Cloudflare release and recovery plan. Frontend rollback does not revert schema or transaction history.

### Hosting / confidentiality notes

- Cloudflare Pages supports private GitHub repositories. Hiding GitHub source prevents public cloning of your repository, but browser-delivered JavaScript remains inspectable and does not constitute a security boundary.
- The staging environment currently points to the production Supabase URL with a **public publishable key**, so don't submit real transactions as test data until a controlled production rehearsal is approved. CI browser tests intercept all Supabase requests and operate on synthetic fixtures.
- The new API key model and the `verify_jwt` compatibility must be checked against current Supabase documentation before changing function settings: do not assume an API key alone establishes user authentication.
- Keep costs at R$0 and do not enable any paid service.

Official references:
- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/platform/limits/
- https://supabase.com/docs/guides/functions/auth-headers
