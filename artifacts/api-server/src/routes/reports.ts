import { Router } from 'express';
import { db } from '@workspace/db';
import { orders, orderItems, transactions, wasteLog, loyalty } from '@workspace/db/schema';
import { gte, and, ne, eq, desc } from 'drizzle-orm';

const router = Router();

router.get('/reports/daily', async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = await db.select().from(orders).where(gte(orders.createdAt, todayStart));
  const valid = todayOrders.filter((o) => o.status !== 'cancelado');

  const totalVendas = valid.reduce((s, o) => s + Number(o.total), 0);
  const quantidadePedidos = valid.length;
  const ticketMedio = quantidadePedidos > 0 ? totalVendas / quantidadePedidos : 0;

  // Payment breakdown
  const byMethod: Record<string, number> = {};
  for (const o of valid) {
    byMethod[o.paymentMethod] = (byMethod[o.paymentMethod] ?? 0) + Number(o.total);
  }

  res.json({ totalVendas, quantidadePedidos, ticketMedio, byMethod });
});

router.get('/reports/products', async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = await db.select().from(orders).where(gte(orders.createdAt, todayStart));
  const validIds = todayOrders.filter((o) => o.status !== 'cancelado').map((o) => o.id);

  if (!validIds.length) {
    res.json([]);
    return;
  }

  const items = await db.select().from(orderItems);
  const filtered = items.filter((i) => validIds.includes(i.orderId));

  const map = new Map<string, { productId: string; name: string; qty: number; total: number }>();
  for (const item of filtered) {
    const e = map.get(item.productId) ?? { productId: item.productId, name: item.name, qty: 0, total: 0 };
    e.qty += item.qty;
    e.total += Number(item.price) * item.qty;
    map.set(item.productId, e);
  }
  res.json(Array.from(map.values()).sort((a, b) => b.qty - a.qty));
});

router.get('/reports/hourly', async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = await db.select().from(orders).where(gte(orders.createdAt, todayStart));
  const valid = todayOrders.filter((o) => o.status !== 'cancelado');

  const buckets = new Map<number, number>();
  for (const o of valid) {
    const hour = new Date(o.createdAt).getHours();
    buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }
  res.json(
    Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour, label: `${String(hour).padStart(2, '0')}h`, count }))
  );
});

router.get('/reports/transactions', async (_req, res) => {
  const rows = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(500);
  res.json(rows);
});

router.get('/reports/waste', async (_req, res) => {
  const rows = await db.select().from(wasteLog).orderBy(desc(wasteLog.createdAt));
  const map = new Map<string, { productId: string; productName: string; quantidade: number }>();
  for (const e of rows) {
    const r = map.get(e.productId) ?? { productId: e.productId, productName: e.productName, quantidade: 0 };
    r.quantidade += e.quantidade;
    map.set(e.productId, r);
  }
  res.json({ summary: Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade), log: rows });
});

router.get('/reports/loyalty', async (_req, res) => {
  const rows = await db.select().from(loyalty);
  res.json(rows);
});

router.post('/reports/clear-sales', async (_req, res) => {
  await db.delete(orders);
  await db.delete(transactions);
  await db.delete(wasteLog);
  res.json({ ok: true });
});

export default router;
