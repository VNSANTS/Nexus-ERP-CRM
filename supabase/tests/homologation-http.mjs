// End-to-end smoke test against the disposable GitHub Actions Supabase only.
// Creates fake tenants and users via local Auth; never connects to production.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const url = process.env.API_URL || process.env.SUPABASE_URL;
const anon = process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY;
const service = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(url || '') || !anon || !service) {
  throw new Error('Refusing to test outside disposable localhost:54321 with local keys');
}
const base = url.replace(/\/$/, '');
const run = randomUUID().slice(0, 8);
async function request(path, { key = anon, token = key, method = 'GET', body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      apikey: key,
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}
function good(response, status, label) {
  assert.equal(response.status, status, label + ': ' + JSON.stringify(response.data));
  return response.data;
}
async function rest(table, body) {
  const data = good(await request('/rest/v1/' + table, { key: service, method: 'POST', body }), 201, 'REST insert ' + table);
  assert.ok(Array.isArray(data) && data.length === 1);
  return data[0];
}
async function edge(body, token = anon) {
  return request('/functions/v1/pedidos', { token, method: 'POST', body });
}
async function waitForEdge() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(base + '/functions/v1/pedidos', { method: 'OPTIONS' });
      if (response.status < 500 && response.status !== 404) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Local Edge Function did not start');
}
async function person(label) {
  const email = 'v1-ci-' + run + '-' + label + '@example.invalid';
  const password = 'LocalTest-' + randomUUID() + '-9A!';
  const created = good(await request('/auth/v1/admin/users', {
    key: service, method: 'POST', body: { email, password, email_confirm: true },
  }), 200, 'local Auth admin create ' + label);
  const user = created.user || created;
  assert.ok(user.id);
  const session = good(await request('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password },
  }), 200, 'local Auth password login ' + label);
  assert.ok(session.access_token && session.access_token !== anon);
  return { id: user.id, token: session.access_token, email, password };
}

await waitForEdge();
const tenantA = randomUUID();
const tenantB = randomUUID();
const [a, b] = await Promise.all([person('a'), person('b')]);
for (const [label, tenant, employee] of [['a', tenantA, a], ['b', tenantB, b]]) {
  await rest('establishments', {
    id: tenant, nome_completo: 'Synthetic Test ' + label, apelido: label,
    email: run + label + '@example.invalid', cpf_cnpj: 'synthetic-' + label,
    status: 'ativo',
  });
  await rest('employees', {
    id: employee.id, auth_user_id: employee.id, establishment_id: tenant,
    nome: 'Test ' + label, username: 'ci-' + run + '-' + label,
    ativo: true, role: 'funcionario', acesso_cozinha: true, acesso_caixa: true,
  });
  const productId = 'ci-' + run + '-' + label;
  await rest('products', {
    id: productId, establishment_id: tenant, name: 'Test item ' + label,
    price: 10, emoji: '🍞', categoria: 'lanche', disponivel: true,
  });
  await rest('stock', { establishment_id: tenant, product_id: productId, name: 'Test item', quantidade: 5 });
}
const admin = await person('platform-admin');
await rest('platform_admins', { id: admin.id, nome: 'Synthetic Platform Admin', is_super_admin: true });
const invitedEmail = 'v1-ci-' + run + '-invite@example.invalid';
const inviteRedirect = 'http://127.0.0.1:8766/Nexus-ERP-CRM/estabelecimento/onboarding';
const invited = good(await request('/auth/v1/invite?redirect_to=' + encodeURIComponent(inviteRedirect), {
  key: service, method: 'POST', body: { email: invitedEmail },
}), 200, 'local Auth invitation');
assert.ok(invited.id || invited.user?.id, 'local Auth invitation returned no user ID');
console.log('PASS local Auth admin creation, password login and two synthetic tenants');

const menuA = good(await edge({ action: 'menu', establishmentId: tenantA }), 200, 'menu A');
const menuB = good(await edge({ action: 'menu', establishmentId: tenantB }), 200, 'menu B');
assert.equal(menuA.products.length, 1);
assert.equal(menuB.products.length, 1);
assert.notEqual(menuA.products[0].id, menuB.products[0].id);
console.log('PASS tenant-scoped public menus');

const forbiddenProduct = await edge({
  action: 'checkout', establishmentId: tenantA,
  cartItems: [{ productId: menuB.products[0].id, qty: 1 }],
  paymentMethod: 'dinheiro', idempotencyKey: randomUUID(),
});
assert.ok([400, 404, 409].includes(forbiddenProduct.status), JSON.stringify(forbiddenProduct));
const checkoutBody = {
  action: 'checkout', establishmentId: tenantA,
  cartItems: [{ productId: menuA.products[0].id, qty: 1 }],
  paymentMethod: 'dinheiro', idempotencyKey: randomUUID(),
};
const created = good(await edge(checkoutBody), 201, 'checkout A');
assert.equal(created.establishmentId, tenantA);
assert.equal(created.status, 'recebido');
const retried = good(await edge(checkoutBody), 201, 'idempotent retry');
assert.equal(retried.id, created.id);
console.log('PASS checkout rejects foreign product and deduplicates public retries');

const listA = good(await edge({ action: 'list' }, a.token), 200, 'list A');
const listB = good(await edge({ action: 'list' }, b.token), 200, 'list B');
assert.ok(listA.some((order) => order.id === created.id));
assert.ok(listB.every((order) => order.id !== created.id));
good(await edge({ action: 'advance', id: created.id }, b.token), 404, 'foreign transition');
const badJwt = await edge({ action: 'list' }, 'invalid.jwt.local');
assert.ok([401, 403].includes(badJwt.status), JSON.stringify(badJwt));
console.log('PASS JWT auth, foreign-tenant denial and invalid-token rejection');

const noAnonDirect = await request('/rest/v1/orders?select=id', { token: anon });
assert.ok([200, 401, 403].includes(noAnonDirect.status));
if (noAnonDirect.status === 200) assert.deepEqual(noAnonDirect.data, []);
const noDirectB = await request('/rest/v1/orders?select=id&establishment_id=eq.' + tenantA, { token: b.token });
assert.ok([200, 401, 403].includes(noDirectB.status));
if (noDirectB.status === 200) assert.deepEqual(noDirectB.data, []);
console.log('PASS RLS/data API do not expose orders to anon or foreign employee');

good(await edge({ action: 'advance', id: created.id, expectedStatus: 'recebido' }, a.token), 200, 'advance to preparo');
good(await edge({ action: 'advance', id: created.id, expectedStatus: 'preparo' }, a.token), 200, 'advance to pronto');
good(await edge({ action: 'confirm-pickup', code: created.code }, b.token), 404, 'cross-store pickup');
const pickup = good(await edge({ action: 'confirm-pickup', code: created.code }, a.token), 200, 'pickup A');
assert.equal(pickup.ok, true);
const finalOrders = good(await edge({ action: 'list' }, a.token), 200, 'final list A');
assert.equal(finalOrders.find((order) => order.id === created.id)?.status, 'retirado');
console.log('PASS HTTP checkout → JWT kitchen → DB transition → tenant-safe pickup');
console.log('ALL LOCAL AUTH / HTTP / JWT / TENANT TESTS PASSED');
if (process.env.NEXUS_E2E_OUTPUT) {
  // Ephemeral CI artifact only, never stored or uploaded to the repository.
  writeFileSync(process.env.NEXUS_E2E_OUTPUT, JSON.stringify({
    tenantA, employeeTokenA: a.token, alreadyCreatedOrderId: created.id,
    adminEmail: admin.email, adminPassword: admin.password,
    invitedEmail, inviteRedirect,
  }), { mode: 0o600 });
}
