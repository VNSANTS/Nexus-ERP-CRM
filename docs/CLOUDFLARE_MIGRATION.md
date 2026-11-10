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

- Updated references from GitHub. `origin/main` is `7d5697e`; PR #10 is closed and PR #11 remains open. The PR branch `deploy/cloudflare-workers` started this work at `50ab5c9` and includes auth fix `3700ae3`, rollback checkpoint `f70cfcb`, and this local-worktree note; `main` is an ancestor. Its worktree was clean and up to date before edits. Local Playwright work and the two pre-existing uncommitted files on `codex/auditoria-playwright` remain untouched.
- The original checkout now also shows untracked `.worktrees/` (this pushed PR worktree) and `.pnpm-store/` (created during the failed offline dependency check). Both are preserved locally and are not part of the PR commits; do not add them accidentally.
- Auth callback and admin notification links now follow the allowlisted request origin and the active Vite base path. Added regression cases for GitHub Pages, Cloudflare staging and rejecting an untrusted origin. The `/nxs` route still requires a live Auth session plus a `platform_admins` row; sensitive Edge Function actions check the same table.
- Validation on this Windows host: frontend TypeScript check passed using the existing compiler; Cloudflare root build passed; 8 CORS/redirect cases passed using Node 24. Local Deno is unavailable; the GitHub connector has not shown Actions runs/status for `3700ae3` yet, so the all-functions Deno typecheck is still pending. No authenticated production-browser smoke test was run.
- Supabase read-only inventory: PostgreSQL `17.6.1.166`; 16 applied migrations versus 17 versioned locally, with `20261106184508_atomic_order_transitions_and_inventory.sql` still pending. Auth has 3 users; Storage has 1 bucket and 1 object. `pg_cron` and `supabase_vault` are installed; one cron job exists and the Vault secrets table has zero records. These counts do not include Edge Function secret values, Auth configuration, or the physical Storage object contents.
- `order_items_id_seq` and `rate_limit_log_id_seq` currently grant USAGE to `anon` and `authenticated`. This must be reviewed and corrected in the approved production release plan; this checkpoint made no database change.
- Read-only preflight of the pending migration confirmed its `checkout_order_atomic` function exists and contains the expected `lpad` anchor; the two new atomic functions are not yet installed. Local migration SHA-256: `22554B674D1563515D088FCAF87BE6D4B857EC531196D3B27F7D6CC42CE111BA`. This confirms applicability only, not a successful rehearsal.
- **Backup and restore remain blocked.** No archive with restore evidence was found in the repository or examined common folders. `psql`, `pg_dump`, `pg_restore`, Docker and Deno are not installed/on PATH. A PostgreSQL 18.6 installer exists locally, but it is not PostgreSQL 17 and was not run. No private production dump, Storage object copy, checksum set or isolated restore has been produced.
- No migration, Edge Function deployment, Supabase Auth setting, Cloudflare production change, Pages retirement, repository visibility change or merge was performed. The PR #11 production gates remain closed until backup and isolated restore are proven.

### Pending migration release and rollback outline

1. After a verified private database backup **and** a successful PostgreSQL 17.6 isolated restore, record the pre-migration `checkout_order_atomic` definition in that private recovery set. Confirm that both new functions are absent, sequence ACLs have an approved separate remediation plan, and the migration file hash still matches the value above.
2. Do not deploy the changed Edge Functions before the migration: `pedidos` and `estoque` call the two new RPCs. Apply only the reviewed migration after explicit production authorization, then verify its single history entry, function ACLs, and cross-establishment behavior on the isolated copy before deploying compatible functions.
3. Roll back application behavior first by redeploying the previous Edge Function versions. The SQL migration changes function definitions and adds two functions, but does not transform table data. If SQL rollback is required, issue a **new forward corrective migration** that restores the saved pre-migration `checkout_order_atomic` definition and drops the two new functions after no deployed code references them.
4. A SQL rollback does not undo orders, inventory changes, or other writes performed after deployment. Recovering data requires a separately approved recovery decision using the private backup and reconciliation; never overwrite the live database with a restore as an automatic rollback.
5. Treat revoking the two broad sequence grants as a separate least-privilege migration after confirming all consumers. Keep `service_role` and administrative owner access, and verify inserts still work through the authorized Edge Functions in the isolated environment. Do not fold this into the pending migration without updating its review and tests.

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

## V1.0 publication checklist (status at 2026-11-10)

- [x] Read-only migration reconciliation: production registry has 16 versions; repository has 17 SQL files. The sole pending file is `20261106184508_atomic_order_transitions_and_inventory.sql`. It references only application tables/RPC definitions and core PostgreSQL features; it does not depend on `pg_cron`, `pg_net` or `supabase_vault`. Its successful synthetic PG17 test does not waive the separate production recovery gate.
- [x] Supabase project is active/healthy on PostgreSQL 17.6.1.166. All 25 deployed Edge Functions are active. Current `verify_jwt=false` exceptions are `cozinha-login` and `customer-login-lookup`; other 23 are true. The repo now declares both exceptions explicitly. Deployed copies sampled for order, inventory, employee/customer login and request approval still contain the legacy GitHub Pages CORS origin and do not include the Cloudflare staging origin; this is why all compatible Edge Functions must be deployed before Cloudflare becomes the customer frontend.
- [x] Cloudflare project `nexus-erp-crm-staging` latest production-branch deployment is commit `4b1fbe5`, successful. Its only hostname is `nexus-erp-crm-staging.pages.dev`, with no custom domain attached; branch is `deploy/cloudflare-workers`. Build is root with `pnpm --filter @workspace/cantinas-nexus run build` to `artifacts/cantinas-nexus/dist/public`. Only the production environment has the four expected variable names (`BASE_PATH`, `NODE_VERSION`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`); values were not read. It still points at the production Supabase project, so no authenticated or mutating browser test was sent there.
- [x] Local payment flow offers Pix, credit/debit card and cash as choices to notify the counter. The UI states the site does not charge; transaction remains pending until a cashier/admin confirms after in-person receipt. No payment gateway or bank API references were found in the checkout/confirmation path. Card terminal settlement and Pix receipt are handled outside the app, in person.
- [x] Private complete PG17 dump still matches the SHA-256 and byte-length recorded in the private restore report; digest withheld. It is the validated 523,903-byte dump. Prior real restore remains partial (830/862 TOC entries; 68 shared tables checked); `pg_cron`, `pg_net` and `supabase_vault` objects remain a documented recovery risk.
- [ ] Auth Site URL, redirect allowlist, SMTP configuration and secret inventory are not exposed by the connected read-only Supabase project/functions tools. No values were queried. Verify these provider-side settings read-only in the Supabase dashboard before proposing exact edits; do not change them without separate approval.
- [x] Frontend build, layout/responsive menu, browser checkout smoke and Cloudflare staging routes/headers pass on the deployed frontend commit `e5802bb`; staging stays `noindex`.
- [x] Synthetic local Auth browser flow covers `/nxs` admin login and authorization, local Mailpit password-recovery link/callback/password update, and invited-user link/callback/onboarding password. [Disposable Supabase CI #55](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42906177458) passed against synthetic `.invalid` accounts; emails were captured locally and never delivered externally.
- [x] [Backend integrity #64](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42906177562) passed (Postgres integrity, CORS and Edge Function typecheck); [Cloudflare staging smoke #48](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42906177646) passed with a synthetic backend.
- [x] Preserve GitHub Pages, keep PR #11 Draft/unmerged, and keep the production Supabase endpoint out of authenticated tests.
- [ ] Reconcile migration history and finish isolated real-backup restore validation. Current evidence is partial and `pg_cron`, `pg_net`, and `supabase_vault` remain unrestored; synthetic Postgres 17 CI is not a restore proof. The pending atomic order/inventory migration passed only against the reviewed synthetic schema.
- [ ] Obtain the owner's explicit recovery-risk decision before requesting a separate authorization to apply the pending production migration. After approval, capture pre-migration state, apply once, confirm history/functions/grants/RLS/sequences/tenant isolation, then deploy matching Edge Functions preserving each `verify_jwt` setting.
- [ ] Review production Auth Site URL and exact redirect allowlist in Supabase: active Pages callback `/Nexus-ERP-CRM/`, Cloudflare callback `/`, and owner onboarding callbacks `/Nexus-ERP-CRM/estabelecimento/onboarding` or `/estabelecimento/onboarding` only while those hosts are active. Keep the current canonical Site URL until the production hostname is chosen. Configure and test real SMTP separately; local CI uses Mailpit only.
- [ ] Approve final hostname, Cloudflare Pages custom-domain attachment, DNS record/TTL and certificate status. Add that exact HTTPS origin to the shared Edge Function CORS allowlist and Auth redirect allowlist before cutover; verify routes, login, invite/recovery, CORS preflight and security headers on the selected host.
- [ ] Rollback readiness: retain Pages and its known-good release; retain the previous Cloudflare deployment and DNS values/TTL. Roll back frontend/DNS first if needed. SQL rollback is a reviewed forward corrective migration based on the saved prior function definition; do not overwrite live data with a backup as automatic rollback.
- [ ] Perform cutover only after all technical gates and separate explicit authorizations for production SQL, Edge Functions, Auth settings and DNS/canonical hostname. Keep Pages available until Cloudflare is verified and retirement is separately authorized.

### Exact rollout order when each gate is cleared

1. Freeze the release commit and rerun the read-only `supabase migration list --remote=phckbsoygqdbkvuxgobr`; stop unless the only pending version is the SQL file above. Verify the private dump/hash locally. Obtain the separate recovery-risk decision.
2. On a tested/accepted recovery point, run `supabase db push --dry-run --remote=phckbsoygqdbkvuxgobr`; inspect the SQL plan and stop unless it contains exactly the approved migration. The dry run applies nothing. Apply with `supabase db push --remote=phckbsoygqdbkvuxgobr` only after migration-specific authorization and only after reviewing the prompt; never add `--yes`. Then verify its history row, RPC grants, RLS, sequence privileges and two-tenant behavior.
3. Deploy the reviewed branch versions of all 25 Edge Functions one by one using `supabase functions deploy <function-name> --project-ref phckbsoygqdbkvuxgobr`; preserve the recorded `verify_jwt` exceptions (`cozinha-login` and `customer-login-lookup` false; remaining 23 true) and existing secret names/values. The repo's config has explicit false entries for both public login entry points. Do not print or rotate secrets. Deployment needs its own authorization.
4. With owner approval, set the final canonical `Site URL`, exact current-host redirect URLs (root and owner onboarding route), SMTP/provider settings and any CAPTCHA host configuration. No wildcard. Send a real test email only to an owner-controlled test inbox after the SMTP change is specifically authorized.
5. Approve the final hostname, add it to the Cloudflare Pages custom domains, set DNS/CNAME and wait for active certificate. Add only that exact HTTPS origin to function CORS and Auth redirects. Keep staging `noindex`; remove it only for the approved final site.
6. Run controlled synthetic browser checks on the selected host: login/logout, invite, recovery, `/nxs`, tenant boundaries, order → in-person Pix/cash/card-terminal receipt → cashier confirmation, inventory, tracking, CORS/preflight and security headers. No real customer/establishment/order records.
7. Keep GitHub Pages and its known-good deployment serving customers through observation. If errors appear, revert Cloudflare to the prior successful deployment or restore prior DNS. Database changes roll back only through an approved forward corrective migration; do not restore over live data. Merge PR #11 and retire Pages only after explicit approval and successful cutover verification.

Official references:
- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://supabase.com/docs/guides/local-development/local-and-hosted-projects
- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/guides/local-development/cli/config
- https://developers.cloudflare.com/pages/platform/limits/
- https://supabase.com/docs/guides/functions/auth-headers
