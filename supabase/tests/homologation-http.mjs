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
async function request(path, { key = anon, token = key, method = 'GET', body, origin } = {}) {
  const headers = {
    apikey: key,
    authorization: 'Bearer ' + token,
    'content-type': 'application/json',
    prefer: 'return=representation',
  };
  if (origin) headers.origin = origin;
  const response = await fetch(base + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
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
async function fn(name, body, token = anon, origin = 'http://127.0.0.1:8766') {
  return request('/functions/v1/' + name, { token, method: 'POST', body, origin });
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
// This function is a public login entry point (verify_jwt=false in the live
// project). A random nonexistent username must reach its handler without a
// user JWT; a gateway-level 401 indicates the local config drifted.
const employeeLoginProbe = await request('/functions/v1/cozinha-login', {
  method: 'POST', body: { username: 'missing-' + randomUUID(), password: 'Synthetic-Invalid-Only' },
});
good(employeeLoginProbe, 404, 'public employee login reaches local handler without user JWT');
assert.equal(employeeLoginProbe.data?.code, 'not_employee');
console.log('PASS employee login function keeps verify_jwt=false and rejects synthetic unknown username');

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
  await rest('stock', { establishment_id: tenant, product_id: productId, name: 'Test item', quantidade: 50 });
}
const kitchenOnly = await person('kitchen-only');
await rest('employees', {
  id: kitchenOnly.id, auth_user_id: kitchenOnly.id, establishment_id: tenantA,
  nome: 'Synthetic Kitchen Operator', username: 'ci-' + run + '-kitchen',
  ativo: true, role: 'funcionario', acesso_cozinha: true, acesso_caixa: false,
  acesso_adm: false, acesso_estoque: false,
});
const admin = await person('platform-admin');
await rest('platform_admins', { id: admin.id, nome: 'Synthetic Platform Admin', is_super_admin: true });
const invitedEmail = 'v1-ci-' + run + '-invite@example.invalid';
const inviteRedirect = 'http://127.0.0.1:8766/Nexus-ERP-CRM/estabelecimento/onboarding';
const invited = good(await request('/auth/v1/invite?redirect_to=' + encodeURIComponent(inviteRedirect), {
  key: service, method: 'POST', body: { email: invitedEmail },
}), 200, 'local Auth invitation');
const invitedUserId = invited.id || invited.user?.id;
assert.ok(invitedUserId, 'local Auth invitation returned no user ID');
const invitedEstablishmentId = randomUUID();
await rest('establishments', {
  id: invitedEstablishmentId, nome_completo: 'Synthetic Invitation Test',
  apelido: 'invite-' + run, email: invitedEmail, cpf_cnpj: 'synthetic-invite-' + run,
  status: 'ativo',
});
await rest('establishment_owners', {
  id: invitedUserId, establishment_id: invitedEstablishmentId,
  nome_completo: 'Synthetic Invited Owner', email: invitedEmail,
  telefone: 'synthetic-' + run, cpf_cnpj: 'synthetic-invite-' + run,
});
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
const afterCheckoutStock = good(await request(
  '/rest/v1/stock?select=quantidade&establishment_id=eq.' + tenantA + '&product_id=eq.' + encodeURIComponent(menuA.products[0].id),
  { key: service },
), 200, 'verify checkout stock deduction');
assert.equal(afterCheckoutStock.length, 1);
assert.equal(afterCheckoutStock[0].quantidade, 49, 'checkout must atomically deduct one item');
console.log('PASS checkout rejects foreign product and deduplicates public retries');

const inactiveProductId = 'ci-inactive-' + run;
await rest('products', {
  id: inactiveProductId, establishment_id: tenantA, name: 'Synthetic inactive item',
  price: 50, emoji: 'x', categoria: 'lanche', disponivel: false,
});
const variant = await rest('product_variants', {
  establishment_id: tenantA, product_id: menuA.products[0].id,
  name: 'Synthetic large', price_delta: 5, active: true,
});
const modifierGroup = await rest('product_modifier_groups', {
  establishment_id: tenantA, product_id: menuA.products[0].id,
  name: 'Synthetic extras', required: true, min_select: 1, max_select: 1, active: true,
});
const modifier = await rest('product_modifiers', {
  establishment_id: tenantA, product_id: menuA.products[0].id,
  group_id: modifierGroup.id, name: 'Synthetic topping', price_delta: 2, active: true,
});
const configuredMenu = good(await edge({ action: 'menu', establishmentId: tenantA }), 200, 'menu with variants and modifiers');
assert.ok(!configuredMenu.products.some((product) => product.id === inactiveProductId), 'inactive product must not appear in public menu');
const configuredProduct = configuredMenu.products.find((product) => product.id === menuA.products[0].id);
assert.ok(configuredProduct?.variants?.some((item) => item.id === variant.id));
assert.ok(configuredProduct?.modifierGroups?.some((group) => group.id === modifierGroup.id));
const customizedOrder = good(await edge({
  action: 'checkout', establishmentId: tenantA,
  cartItems: [{ productId: menuA.products[0].id, qty: 1, variantId: variant.id, modifierIds: [modifier.id] }],
  paymentMethod: 'pix', idempotencyKey: randomUUID(),
}), 201, 'checkout with variant and modifier');
assert.equal(Number(customizedOrder.total), 17, 'checkout total must include base, variant and modifier prices');
const invalidOrderTransition = await edge({ action: 'set-status', id: customizedOrder.id, status: 'retirado' }, a.token);
assert.equal(invalidOrderTransition.status, 409, 'order cannot skip kitchen states');
const canceledPendingOrder = good(await edge({ action: 'set-status', id: customizedOrder.id, status: 'cancelado' }, a.token), 200, 'cancel pending synthetic order');
assert.equal(canceledPendingOrder.status, 'cancelado');
const canceledPendingTransactions = good(await request(
  '/rest/v1/transactions?select=status&order_id=eq.' + encodeURIComponent(customizedOrder.id),
  { key: service },
), 200, 'verify canceled pending payment');
assert.equal(canceledPendingTransactions[0].status, 'cancelado');
console.log('PASS inactive menu filtering, variant/modifier selection and calculated order total');

const listA = good(await edge({ action: 'list' }, a.token), 200, 'list A');
const listB = good(await edge({ action: 'list' }, b.token), 200, 'list B');
assert.ok(listA.some((order) => order.id === created.id));
assert.ok(listB.every((order) => order.id !== created.id));
good(await edge({ action: 'advance', id: created.id }, b.token), 404, 'foreign transition');
const badJwt = await edge({ action: 'list' }, 'invalid.jwt.local');
assert.ok([401, 403].includes(badJwt.status), JSON.stringify(badJwt));
console.log('PASS JWT auth, foreign-tenant denial and invalid-token rejection');

const allowedOrigin = 'http://127.0.0.1:8766';
const forbiddenOrigin = 'https://untrusted.example';
const handlerError = await fn('pedidos', { action: 'advance', id: 'missing-' + run }, a.token, allowedOrigin);
assert.equal(handlerError.status, 404, 'authenticated handler should return scoped not-found');
const deniedOriginError = await fn('pedidos', { action: 'advance', id: 'missing-' + run }, a.token, forbiddenOrigin);
assert.equal(deniedOriginError.status, 404, 'handler result should be preserved for unknown browser origin');
const rejectedPreflight = await request('/functions/v1/pedidos', {
  method: 'OPTIONS', token: a.token, origin: forbiddenOrigin,
});
assert.equal(rejectedPreflight.status, 403, 'unknown CORS preflight must be rejected');
console.log('PASS authenticated handler error and unknown-origin preflight status (gateway headers are tested by cors.test.ts)');

// An order placed through the public checkout is pending until the cashier
// confirms the in-person payment. Repeating confirmation must be harmless.
const transactions = good(await request(
  '/rest/v1/transactions?select=id,order_id,method,valor,status&order_id=eq.' + encodeURIComponent(created.id),
  { key: service },
), 200, 'read synthetic checkout transaction');
assert.equal(transactions.length, 1, 'checkout should create exactly one transaction');
assert.equal(transactions[0].status, 'pendente');
const paid = await fn('gerenciar-dados', { action: 'confirm-transaction', id: transactions[0].id }, a.token);
good(paid, 200, 'cashier confirms in-person payment');
good(await fn('gerenciar-dados', { action: 'confirm-transaction', id: transactions[0].id }, a.token), 409, 'duplicate cashier confirmation');
const paymentRows = good(await request(
  '/rest/v1/transactions?select=status,method,valor&order_id=eq.' + encodeURIComponent(created.id),
  { key: service },
), 200, 'verify synthetic payment');
assert.equal(paymentRows[0].status, 'confirmado');
assert.equal(Number(paymentRows[0].valor), 10);
const cashierDenied = await fn('pedidos', {
  action: 'manual', items: [{ productId: menuA.products[0].id, qty: 1 }],
  paymentMethod: 'dinheiro', idempotencyKey: randomUUID(),
}, kitchenOnly.token, allowedOrigin);
assert.equal(cashierDenied.status, 403, 'kitchen-only profile must not create cashier orders');
for (const paymentMethod of ['dinheiro', 'pix', 'credito', 'debito']) {
  const manualOrder = good(await fn('pedidos', {
    action: 'manual', items: [{
      productId: menuA.products[0].id, qty: 1,
      variantId: variant.id, modifierIds: [modifier.id],
    }],
    paymentMethod, idempotencyKey: randomUUID(),
  }, a.token), 201, 'manual in-person order ' + paymentMethod);
  const manualTx = good(await request(
    '/rest/v1/transactions?select=method,status,valor&order_id=eq.' + encodeURIComponent(manualOrder.id),
    { key: service },
  ), 200, 'verify manual payment ' + paymentMethod);
  assert.equal(manualTx.length, 1);
  assert.equal(manualTx[0].method, paymentMethod);
  assert.equal(manualTx[0].status, 'confirmado');
}
const canceledPaidOrder = good(await fn('pedidos', {
  action: 'manual', items: [{ productId: menuA.products[0].id, qty: 1, variantId: variant.id, modifierIds: [modifier.id] }],
  paymentMethod: 'dinheiro', idempotencyKey: randomUUID(),
}, a.token), 201, 'create paid order for cancellation test');
good(await edge({ action: 'set-status', id: canceledPaidOrder.id, status: 'cancelado' }, a.token), 200, 'cancel confirmed synthetic payment');
const reversedTransactions = good(await request(
  '/rest/v1/transactions?select=status&order_id=eq.' + encodeURIComponent(canceledPaidOrder.id),
  { key: service },
), 200, 'verify canceled confirmed payment');
assert.equal(reversedTransactions[0].status, 'estornado', 'confirmed payment must be reversed on cancellation');
console.log('PASS cashier-only payment confirmation, duplicate prevention and amount integrity');

// Inventory operations use the atomic RPC; overspending and cross-tenant
// movement must fail without changing either tenant's balance.
const stockBefore = good(await request(
  '/rest/v1/stock?select=quantidade&establishment_id=eq.' + tenantA + '&product_id=eq.' + encodeURIComponent(menuA.products[0].id),
  { key: service },
), 200, 'read synthetic stock before moves');
assert.equal(stockBefore.length, 1);
const movedIn = await fn('estoque', { action: 'entry', productId: menuA.products[0].id, quantidade: 3, motivo: 'CI synthetic entry' }, a.token);
good(movedIn, 201, 'inventory entry');
const movedOut = await fn('estoque', { action: 'waste', productId: menuA.products[0].id, quantidade: 1, motivo: 'CI synthetic waste' }, a.token);
good(movedOut, 201, 'inventory waste');
const excessiveWaste = await fn('estoque', { action: 'waste', productId: menuA.products[0].id, quantidade: 999, motivo: 'CI insufficient stock' }, a.token);
assert.equal(excessiveWaste.status, 409, 'insufficient stock must be rejected');
const inventoryDenied = await fn('estoque', { action: 'entry', productId: menuA.products[0].id, quantidade: 1, motivo: 'CI permission denial' }, kitchenOnly.token);
assert.equal(inventoryDenied.status, 403, 'profile without inventory access must be denied');
const foreignStock = await fn('estoque', { action: 'entry', productId: menuB.products[0].id, quantidade: 1, motivo: 'CI cross-tenant' }, a.token);
assert.equal(foreignStock.status, 404, 'cross-tenant stock movement must be hidden');
const remainingStock = good(await request(
  '/rest/v1/stock?select=quantidade&establishment_id=eq.' + tenantA + '&product_id=eq.' + encodeURIComponent(menuA.products[0].id),
  { key: service },
), 200, 'read balance before concurrent waste');
const available = remainingStock[0].quantidade;
assert.ok(available > 0);
const concurrentWasteQuantity = Math.max(1, available - 2); // Preserve a small balance for the browser E2E that follows.
const concurrentWaste = await Promise.all(Array.from({ length: 3 }, () => fn('estoque', {
  action: 'waste', productId: menuA.products[0].id, quantidade: concurrentWasteQuantity,
  motivo: 'CI concurrent atomicity',
}, a.token)));
assert.equal(concurrentWaste.filter((response) => response.status === 201).length, 1, 'only one concurrent full-balance waste may succeed');
assert.equal(concurrentWaste.filter((response) => response.status === 409).length, 2, 'remaining concurrent wastes must see insufficient stock');
console.log('PASS inventory entry, waste, insufficient-stock denial and cross-tenant isolation');

const noAnonDirect = await request('/rest/v1/orders?select=id', { token: anon });
assert.ok([200, 401, 403].includes(noAnonDirect.status));
if (noAnonDirect.status === 200) assert.deepEqual(noAnonDirect.data, []);
const noDirectB = await request('/rest/v1/orders?select=id&establishment_id=eq.' + tenantA, { token: b.token });
assert.ok([200, 401, 403].includes(noDirectB.status));
if (noDirectB.status === 200) assert.deepEqual(noDirectB.data, []);
console.log('PASS RLS/data API do not expose orders to anon or foreign employee');

const concurrentAdvances = await Promise.all([
  edge({ action: 'advance', id: created.id, expectedStatus: 'recebido' }, a.token),
  edge({ action: 'advance', id: created.id, expectedStatus: 'recebido' }, a.token),
]);
assert.ok(concurrentAdvances.every((response) => response.status === 200));
assert.ok(concurrentAdvances.every((response) => response.data.status === 'preparo'), 'concurrent advance must apply exactly one state transition');
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
