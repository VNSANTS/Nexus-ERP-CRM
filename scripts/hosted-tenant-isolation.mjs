/**
 * Hosted multi-tenant negative write tests for the two synthetic QA stores.
 * Tokens and passwords stay in process memory; response bodies are never logged.
 * Run only through the manually dispatched protected GitHub Environment workflow.
 */
const PROJECT_REF = "phckbsoygqdbkvuxgobr";
const required = [
  "SUPABASE_URL", "SUPABASE_ANON_KEY",
  "QA_A_EMAIL", "QA_A_PASSWORD", "QA_B_EMAIL", "QA_B_PASSWORD",
  "QA_A_PRODUCT_ID", "QA_B_PRODUCT_ID", "QA_A_ORDER_ID", "QA_A_STOCK_PRODUCT_ID",
];
for (const name of required) {
  if (!process.env[name]) {
    console.error("BLOCKED: required protected Environment configuration is missing.");
    process.exit(2);
  }
}
const base = new URL(process.env.SUPABASE_URL);
if (base.protocol !== "https:" || base.hostname !== `${PROJECT_REF}.supabase.co`) {
  console.error("BLOCKED: SUPABASE_URL must target the approved hosted QA project over HTTPS.");
  process.exit(2);
}
const anon = process.env.SUPABASE_ANON_KEY;
let hadBlockedChecks = false;
class QaBlockedError extends Error {
  constructor(message, kind = "BLOCKED_AUTH") {
    super(message);
    this.kind = kind;
  }
}
class IsolationIntegrityError extends Error {}
const output = (result, label) => {
  if (result === "PASS") console.log("PASS " + label);
  else if (result.startsWith("BLOCKED")) {
    hadBlockedChecks = true;
    console.log(result + " " + label);
  }
};
async function json(response) {
  try { return await response.json(); } catch { return null; }
}
async function login(email, password) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", base), {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await json(response);
  if (!response.ok || !payload?.access_token || !payload?.user?.id) {
    throw new QaBlockedError("QA identity could not authenticate (HTTP " + response.status + "); response omitted.");
  }
  return { token: payload.access_token, userId: payload.user.id };
}
async function fn(name, token, body) {
  const response = await fetch(new URL(`/functions/v1/${name}`, base), {
    method: "POST",
    headers: {
      apikey: anon,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, payload: await json(response) };
}
function assertOk(result, label) {
  if (result.status === 401) throw new QaBlockedError(label + ": Auth session was rejected (HTTP 401).");
  if (result.status === 403) throw new QaBlockedError(label + ": required module permission is missing (HTTP 403).", "BLOCKED_PERMISSION");
  if (result.status !== 200) throw new Error(label + " read failed (HTTP " + result.status + "); response omitted.");
  return result.payload;
}
function sameFields(actual, expected, fields, label) {
  if (!actual || fields.some((field) => actual[field] !== expected[field])) {
    throw new IsolationIntegrityError(label + ": synthetic resource changed after cross-tenant request.");
  }
}
async function listProducts(token) {
  return assertOk(await fn("gerenciar-dados", token, { action: "list-products" }), "Product list");
}
async function listOrders(token) {
  return assertOk(await fn("pedidos", token, { action: "list" }), "Order list");
}
async function listStock(token) {
  return assertOk(await fn("gerenciar-dados", token, { action: "list-stock" }), "Stock list");
}
async function listTransactions(token) {
  return assertOk(await fn("gerenciar-dados", token, { action: "report-transactions" }), "Transaction list");
}
async function negativeWrite({ label, request, expectedStatus, verify }) {
  const result = await request();
  if (result.status >= 200 && result.status < 300) {
    await verify();
    console.error(`FAIL SECURITY: ${label} accepted a cross-tenant write (HTTP 200). Further write probes stopped.`);
    process.exit(3);
  }
  await verify();
  if (result.status === 401) {
    output("BLOCKED_AUTH", label + ": QA B session was rejected (HTTP 401).");
    return;
  }
  if (result.status === 403) {
    output("BLOCKED_PERMISSION", label + ": QA B lacks the required module permission (HTTP 403).");
    return;
  }
  if (result.status !== expectedStatus) {
    throw new Error(`${label}: expected HTTP ${expectedStatus}, received HTTP ${result.status}; A state verified unchanged, response omitted.`);
  }
  output("PASS", `${label}: cross-tenant write rejected and QA A state unchanged (HTTP ${expectedStatus}).`);
}
let sessionA;
let sessionB;
try {
  sessionA = await login(process.env.QA_A_EMAIL, process.env.QA_A_PASSWORD);
  sessionB = await login(process.env.QA_B_EMAIL, process.env.QA_B_PASSWORD);
  if (sessionA.userId === sessionB.userId) throw new Error("QA identities are not independent.");
  output("PASS", "distinct Auth identities issued sessions.");

  const [productsA, productsB, ordersA, ordersB] = await Promise.all([
    listProducts(sessionA.token), listProducts(sessionB.token),
    listOrders(sessionA.token), listOrders(sessionB.token),
  ]);
  const productA = productsA.find((row) => row.id === process.env.QA_A_PRODUCT_ID);
  const productB = productsB.find((row) => row.id === process.env.QA_B_PRODUCT_ID);
  const orderA = ordersA.find((row) => row.id === process.env.QA_A_ORDER_ID);
  if (!productA || !orderA || !Array.isArray(productsB) || !Array.isArray(ordersB)) {
    throw new Error("Configured QA A fixtures or required role access are missing.");
  }
  if (productsB.some((row) => row.id === productA.id) ||
      productsA.some((row) => row.id === productB.id) ||
      ordersB.some((row) => row.id === orderA.id)) {
    console.error("FAIL SECURITY: another tenant's resource appeared in QA B list; no further writes attempted.");
    process.exit(3);
  }
  if (process.env.QA_B_PRODUCT_ID && !productB) {
    throw new Error("Configured QA B product is not visible to QA B.");
  }
  output("PASS", "product and order listings do not disclose QA A fixtures to QA B.");

  const productSnapshot = { name: productA.name, price: productA.price, disponivel: productA.disponivel, updated_at: productA.updated_at };
  await negativeWrite({
    label: "products.update-product",
    request: () => fn("gerenciar-dados", sessionB.token, {
      action: "update-product", id: productA.id, name: productA.name,
    }),
    expectedStatus: 404,
    verify: async () => {
      const current = (await listProducts(sessionA.token)).find((row) => row.id === productA.id);
      sameFields(current, productSnapshot, ["name", "price", "disponivel", "updated_at"], "Product");
    },
  });

  const orderSnapshot = { status: orderA.status, updated_at: orderA.updated_at };
  await negativeWrite({
    label: "orders.set-status",
    request: () => fn("pedidos", sessionB.token, {
      action: "set-status", id: orderA.id, status: orderA.status,
    }),
    expectedStatus: 404,
    verify: async () => {
      const current = (await listOrders(sessionA.token)).find((row) => row.id === orderA.id);
      sameFields(current, orderSnapshot, ["status", "updated_at"], "Order");
    },
  });

  const stocksA = await listStock(sessionA.token);
  const stockA = stocksA.find((row) => row.product_id === process.env.QA_A_STOCK_PRODUCT_ID);
  if (!stockA) throw new Error("Configured QA A stock fixture is missing.");
  const stocksB = await listStock(sessionB.token);
  if (!stocksA.some((row) => row.product_id === process.env.QA_A_PRODUCT_ID) ||
      !stocksB.some((row) => row.product_id === process.env.QA_B_PRODUCT_ID)) {
    throw new Error("Configured QA stock fixtures do not match the corresponding accounts.");
  }
  if (stocksB.some((row) => row.product_id === stockA.product_id) ||
      stocksA.some((row) => row.product_id === process.env.QA_B_PRODUCT_ID)) {
    console.error("FAIL SECURITY: stock listing crossed tenant boundary; no further writes attempted.");
    process.exit(3);
  }
  const stockSnapshot = { minimo: stockA.minimo, quantity: stockA.quantity, name: stockA.name, updated_at: stockA.updated_at };
  await negativeWrite({
    label: "stock.set-minimo",
    request: () => fn("estoque", sessionB.token, {
      action: "set-minimo", productId: stockA.product_id, minimo: stockA.minimo,
    }),
    expectedStatus: 404,
    verify: async () => {
      const current = (await listStock(sessionA.token)).find((row) => row.product_id === stockA.product_id);
      sameFields(current, stockSnapshot, ["minimo", "quantity", "name", "updated_at"], "Stock");
    },
  });

  const pending = (await listTransactions(sessionA.token))
    .find((row) => row.status === "pendente" && row.id && row.paid_at == null && row.confirmed_by == null);
  if (!pending) {
    output("BLOCKED", "cash.confirm-transaction: no pending synthetic QA A payment exists; no transaction was created or changed.");
  } else {
    const transactionSnapshot = { status: pending.status, paid_at: pending.paid_at, confirmed_by: pending.confirmed_by };
    await negativeWrite({
      label: "cash.confirm-transaction",
      request: () => fn("gerenciar-dados", sessionB.token, {
        action: "confirm-transaction", id: pending.id,
      }),
      expectedStatus: 409,
      verify: async () => {
        const current = (await listTransactions(sessionA.token)).find((row) => row.id === pending.id);
        sameFields(current, transactionSnapshot, ["status", "paid_at", "confirmed_by"], "Transaction");
      },
    });
  }
 } catch (error) {
  if (error instanceof QaBlockedError) {
    output(error.kind, error.message);
    process.exitCode = 2;
  } else if (error instanceof IsolationIntegrityError) {
    console.error("FAIL SECURITY: " + error.message);
    process.exitCode = 3;
  } else {
    console.error("FAIL TEST: " + (error instanceof Error ? error.message : "hosted QA test failed; details withheld"));
    process.exitCode = 1;
  }
} finally {
  if (sessionA) sessionA.token = "";
  if (sessionB) sessionB.token = "";
}

if (hadBlockedChecks && process.exitCode === undefined) {
  console.error("BLOCKED: hosted isolation verification incomplete; see blocked checks above.");
  process.exitCode = 2;
} else if (!hadBlockedChecks && process.exitCode === undefined) {
  console.log("PASS all configured hosted isolation checks completed.");
}
