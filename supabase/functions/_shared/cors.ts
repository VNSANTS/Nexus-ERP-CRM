/**
 * Origin-scoped CORS for the Nexus ERP/CRM Edge Functions.
 * Keep allowed browser origins explicit: a public frontend key does not
 * authorize access to a tenant or an employee's account.
 */
const ALLOWED_ORIGINS = new Set([
  'https://vnsants.github.io',              // legacy GitHub Pages
  'https://nexus-erp-crm-staging.pages.dev', // Cloudflare staging
  'http://localhost:5173',                  // Vite development
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8766',                  // isolated browser E2E
]);

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    Vary: 'Origin',
  };
}

/**
 * Apply request-scoped CORS to every response (including auth failures and
 * errors) without leaking the legacy static CORS header to unknown origins.
 * No wildcard, credentials or user-controlled Origin reflection.
 */
export async function withCors(
  req: Request,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const cors = buildCorsHeaders(req);
  const permitted = Object.hasOwn(cors, 'Access-Control-Allow-Origin');

  if (req.method === 'OPTIONS') {
    return permitted
      ? new Response(null, { status: 204, headers: cors })
      : new Response('Origin not permitted', { status: 403, headers: { Vary: 'Origin' } });
  }

  const response = await handler();
  const headers = new Headers(response.headers);

  // Most old functions call jsonResponse(), which adds a fixed Github origin.
  // Discard it and set the real request's allowed origin instead.
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  headers.delete('Access-Control-Allow-Headers');
  headers.delete('Access-Control-Allow-Methods');
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
