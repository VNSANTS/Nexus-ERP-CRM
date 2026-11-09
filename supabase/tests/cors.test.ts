import { buildCorsHeaders, getPublicAppUrl, withCors } from '../functions/_shared/cors.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const url = 'https://project.supabase.co/functions/v1/pedidos';
const gh = 'https://vnsants.github.io';
const cf = 'https://nexus-erp-crm-staging.pages.dev';

Deno.test('auth and admin links resolve to the requesting allowlisted environment', () => {
  const legacy = new Request(url, { headers: { Origin: gh } });
  const staging = new Request(url, { headers: { Origin: cf } });
  assert(getPublicAppUrl(legacy) === `${gh}/Nexus-ERP-CRM/`, 'Legacy callback should use the Pages base path');
  assert(getPublicAppUrl(legacy, 'nxs') === `${gh}/Nexus-ERP-CRM/nxs`, 'Legacy admin route should include the Pages base path');
  assert(getPublicAppUrl(staging) === `${cf}/`, 'Cloudflare callback should use the site root');
  assert(getPublicAppUrl(staging, 'nxs') === `${cf}/nxs`, 'Cloudflare admin route should use the SPA route');
});

Deno.test('public app links reject untrusted origins without an explicit environment URL', () => {
  const req = new Request(url, { headers: { Origin: 'https://evil.example' } });
  let rejected = false;
  try { getPublicAppUrl(req); } catch { rejected = true; }
  assert(rejected, 'Untrusted origin must not become an auth redirect');
});

Deno.test('allowed sites receive exact CORS origin, never a wildcard', () => {
  for (const origin of [gh, cf, 'http://127.0.0.1:8766']) {
    const headers = buildCorsHeaders(new Request(url, { headers: { Origin: origin } }));
    assert(headers['Access-Control-Allow-Origin'] === origin, 'Expected strict origin match');
    assert(headers.Vary === 'Origin', 'Origin-dependent responses must vary cache');
    assert(!headers['Access-Control-Allow-Origin'].includes('*'), 'Wildcard not allowed');
  }
});

Deno.test('untrusted and lookalike origins are not accepted', () => {
  for (const origin of [
    'https://evil.example',
    'https://nexus-erp-crm-staging.pages.dev.evil.example',
    'https://bad.nexus-erp-crm-staging.pages.dev',
    'https://vnsants.github.io.evil.example',
    'null',
  ]) {
    const headers = buildCorsHeaders(new Request(url, { headers: { Origin: origin } }));
    assert(!headers['Access-Control-Allow-Origin'], 'Unexpected origin reflected: ' + origin);
  }
});

Deno.test('preflight is answered before business code executes', async () => {
  const req = new Request(url, { method: 'OPTIONS', headers: { Origin: cf } });
  const res = await withCors(req, () => { throw new Error('should not execute handler'); });
  assert(res.status === 204, 'Preflight should succeed');
  assert(res.headers.get('access-control-allow-origin') === cf, 'Cloudflare origin not returned');
  assert(res.headers.get('access-control-allow-methods')?.includes('POST'), 'Missing POST');
});

Deno.test('disallowed preflight fails closed', async () => {
  const req = new Request(url, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  const res = await withCors(req, () => new Response('should not run'));
  assert(res.status === 403, 'Disallowed preflight must be forbidden');
  assert(res.headers.get('access-control-allow-origin') === null, 'Origin leaked');
});

Deno.test('middleware overwrites legacy static origin even on error responses', async () => {
  for (const origin of [cf, 'https://evil.example']) {
    const req = new Request(url, { method: 'POST', headers: { Origin: origin } });
    const res = await withCors(req, () => new Response('{"error":"denied"}', {
      status: 403,
      headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': gh },
    }));
    assert(res.status === 403, 'Status must be preserved');
    assert((await res.text()) === '{"error":"denied"}', 'Response body must be preserved');
    assert(res.headers.get('content-type') === 'application/json', 'Content type changed');
    assert(res.headers.get('access-control-allow-origin') === (origin === cf ? cf : null), 'Wrong origin');
  }
});

Deno.test('server-to-server requests without Origin are unaffected', async () => {
  const res = await withCors(new Request(url), () => new Response('ok'));
  assert(res.status === 200 && (await res.text()) === 'ok', 'Response changed');
  assert(res.headers.get('access-control-allow-origin') === null, 'No-Origin request must not receive a browser origin');
});
