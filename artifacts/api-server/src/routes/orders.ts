import { Router } from 'express';
import { db } from '@workspace/db';
import { orders, orderItems, stock, transactions, loyalty, dailyCounter, products, promotions } from '@workspace/db/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';

const router = Router();

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function shortCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get all orders (today + optionally all). ?all=1 to get all. ?date=yyyy-mm-dd for specific day */
router.get('/orders', async (req, res) => {
  const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
  const items = await db.select().from(orderItems);
  const ordersWithItems = rows.map((o) => ({
    ...o,
    items: items.filter((i) => i.orderId === o.id),
  }));
  res.json(ordersWithItems);
});

router.get('/orders/:id', async (req, res) => {
  const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id));
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  res.json({ ...order, items });
});

router.get('/orders/by-code/:code', async (req, res) => {
  const code = req.params.code.trim().padStart(3, '0');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.code, code), gte(orders.createdAt, todayStart)));
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  res.json({ ...order, items });
});

/** Checkout: create order from cart items */
router.post('/orders/checkout', async (req, res) => {
  const { cartItems, paymentMethod, observacoes, telefone } = req.body;
  if (!cartItems?.length) {
    res.status(400).json({ error: 'Empty cart' });
    return;
  }

  // Get promotions
  const promos = await db.select().from(promotions).where(eq(promotions.ativo, true));

  function getEffectivePrice(productId: string, basePrice: number): number {
    const promo = promos.find((p) => p.productIds.includes(productId));
    if (!promo) return basePrice;
    return promo.tipo === 'percentual'
      ? Math.max(0, basePrice * (1 - Number(promo.valor) / 100))
      : Math.max(0, basePrice - Number(promo.valor));
  }

  // Resolve prices
  const allProducts = await db.select().from(products);
  const resolvedItems: Array<{ productId: string; name: string; price: number; qty: number }> = [];
  for (const ci of cartItems) {
    const p = allProducts.find((x) => x.id === ci.productId);
    if (!p) continue;
    const price = getEffectivePrice(p.id, Number(p.price));
    resolvedItems.push({ productId: p.id, name: p.name, price, qty: ci.qty });
  }
  if (!resolvedItems.length) {
    res.status(400).json({ error: 'No valid items' });
    return;
  }

  const total = resolvedItems.reduce((s, i) => s + i.price * i.qty, 0);

  // Daily counter
  const today = todayKey();
  const [counter] = await db.select().from(dailyCounter).where(eq(dailyCounter.date, today));
  const newCount = (counter?.count ?? 0) + 1;
  if (counter) {
    await db.update(dailyCounter).set({ count: newCount }).where(eq(dailyCounter.date, today));
  } else {
    await db.insert(dailyCounter).values({ date: today, count: 1 });
  }

  const code = String(newCount).padStart(3, '0');
  const paymentCode = `PAG-${shortCode()}`;
  const id = uid();
  const now = new Date();

  // Insert order
  const [order] = await db
    .insert(orders)
    .values({ id, code, paymentCode, total: String(total), paymentMethod, status: 'recebido', observacoes: observacoes?.trim() ?? '', telefone: telefone?.trim() ?? '', createdAt: now, updatedAt: now })
    .returning();

  // Insert items
  await db.insert(orderItems).values(
    resolvedItems.map((i) => ({ orderId: id, productId: i.productId, name: i.name, price: String(i.price), qty: i.qty }))
  );

  // Stock deductions
  for (const item of resolvedItems) {
    const [s] = await db.select().from(stock).where(eq(stock.productId, item.productId));
    if (s) {
      await db.update(stock).set({ quantidade: Math.max(0, s.quantidade - item.qty), updatedAt: now }).where(eq(stock.productId, item.productId));
    }
  }

  // Transaction
  await db.insert(transactions).values({ id: uid(), orderId: id, orderCode: code, method: paymentMethod, valor: String(total), status: 'confirmado', createdAt: now });

  // Loyalty
  const tel = telefone?.trim();
  if (tel) {
    const [loyaltyRec] = await db.select().from(loyalty).where(eq(loyalty.telefone, tel));
    if (loyaltyRec) {
      await db.update(loyalty).set({ pedidos: loyaltyRec.pedidos + 1, updatedAt: now }).where(eq(loyalty.telefone, tel));
    } else {
      await db.insert(loyalty).values({ telefone: tel, pedidos: 1, updatedAt: now });
    }
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  res.status(201).json({ ...order, items });
});

/** Manual order (Caixa Rápido) */
router.post('/orders/manual', async (req, res) => {
  const { items: rawItems, paymentMethod, telefone, observacoes } = req.body;
  if (!rawItems?.length) {
    res.status(400).json({ error: 'Empty items' });
    return;
  }

  const allProducts = await db.select().from(products);
  const promos = await db.select().from(promotions).where(eq(promotions.ativo, true));

  function getEffectivePrice(productId: string, basePrice: number): number {
    const promo = promos.find((p) => p.productIds.includes(productId));
    if (!promo) return basePrice;
    return promo.tipo === 'percentual'
      ? Math.max(0, basePrice * (1 - Number(promo.valor) / 100))
      : Math.max(0, basePrice - Number(promo.valor));
  }

  const resolvedItems: Array<{ productId: string; name: string; price: number; qty: number }> = [];
  for (const ri of rawItems) {
    if (ri.qty <= 0) continue;
    const p = allProducts.find((x) => x.id === ri.productId);
    if (!p) continue;
    const price = getEffectivePrice(p.id, Number(p.price));
    resolvedItems.push({ productId: p.id, name: p.name, price, qty: ri.qty });
  }
  if (!resolvedItems.length) {
    res.status(400).json({ error: 'No valid items' });
    return;
  }

  const total = resolvedItems.reduce((s, i) => s + i.price * i.qty, 0);
  const today = todayKey();
  const [counter] = await db.select().from(dailyCounter).where(eq(dailyCounter.date, today));
  const newCount = (counter?.count ?? 0) + 1;
  if (counter) {
    await db.update(dailyCounter).set({ count: newCount }).where(eq(dailyCounter.date, today));
  } else {
    await db.insert(dailyCounter).values({ date: today, count: 1 });
  }

  const code = String(newCount).padStart(3, '0');
  const paymentCode = `PAG-${shortCode()}`;
  const id = uid();
  const now = new Date();

  const [order] = await db
    .insert(orders)
    .values({ id, code, paymentCode, total: String(total), paymentMethod, status: 'recebido', observacoes: observacoes?.trim() ?? '', telefone: telefone?.trim() ?? '', createdAt: now, updatedAt: now })
    .returning();

  await db.insert(orderItems).values(
    resolvedItems.map((i) => ({ orderId: id, productId: i.productId, name: i.name, price: String(i.price), qty: i.qty }))
  );

  for (const item of resolvedItems) {
    const [s] = await db.select().from(stock).where(eq(stock.productId, item.productId));
    if (s) {
      await db.update(stock).set({ quantidade: Math.max(0, s.quantidade - item.qty), updatedAt: now }).where(eq(stock.productId, item.productId));
    }
  }

  await db.insert(transactions).values({ id: uid(), orderId: id, orderCode: code, method: paymentMethod, valor: String(total), status: 'confirmado', createdAt: now });

  const tel = telefone?.trim();
  if (tel) {
    const [loyaltyRec] = await db.select().from(loyalty).where(eq(loyalty.telefone, tel));
    if (loyaltyRec) {
      await db.update(loyalty).set({ pedidos: loyaltyRec.pedidos + 1, updatedAt: now }).where(eq(loyalty.telefone, tel));
    } else {
      await db.insert(loyalty).values({ telefone: tel, pedidos: 1, updatedAt: now });
    }
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  res.status(201).json({ ...order, items });
});

router.patch('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  const now = new Date();
  const [updated] = await db
    .update(orders)
    .set({ status, updatedAt: now })
    .where(eq(orders.id, req.params.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  if (status === 'cancelado') {
    await db.update(transactions).set({ status: 'estornado' }).where(eq(transactions.orderId, req.params.id));
  }
  res.json(updated);
});

router.patch('/orders/:id/observacoes', async (req, res) => {
  const { observacoes } = req.body;
  const [updated] = await db
    .update(orders)
    .set({ observacoes, updatedAt: new Date() })
    .where(eq(orders.id, req.params.id))
    .returning();
  res.json(updated);
});

/** Confirm pickup by day-code */
router.post('/orders/confirm-pickup', async (req, res) => {
  const code = req.body.code?.trim().padStart(3, '0');
  if (!code) {
    res.status(400).json({ error: 'Code required' });
    return;
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [order] = await db.select().from(orders).where(and(eq(orders.code, code), gte(orders.createdAt, todayStart)));
  if (!order) {
    res.status(404).json({ ok: false, message: 'Pedido não encontrado para hoje.' });
    return;
  }
  if (order.status === 'cancelado') {
    res.json({ ok: false, message: 'Este pedido foi cancelado.' });
    return;
  }
  if (order.status === 'retirado') {
    res.json({ ok: false, message: 'Este pedido já foi retirado.' });
    return;
  }
  await db.update(orders).set({ status: 'retirado', updatedAt: new Date() }).where(eq(orders.id, order.id));
  res.json({ ok: true, message: `Pedido ${order.code} retirado com sucesso!` });
});

/** Advance order status */
router.post('/orders/:id/advance', async (req, res) => {
  const flow = ['recebido', 'preparo', 'pronto', 'retirado'];
  const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id));
  if (!order) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const idx = flow.indexOf(order.status);
  if (idx === -1 || idx === flow.length - 1) {
    res.json(order);
    return;
  }
  const [updated] = await db.update(orders).set({ status: flow[idx + 1], updatedAt: new Date() }).where(eq(orders.id, order.id)).returning();
  res.json(updated);
});

export default router;
