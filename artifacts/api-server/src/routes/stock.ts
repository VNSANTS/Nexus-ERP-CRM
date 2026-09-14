import { Router } from 'express';
import { db } from '@workspace/db';
import { stock, stockHistory, wasteLog } from '@workspace/db/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

router.get('/stock', async (_req, res) => {
  const rows = await db.select().from(stock);
  res.json(rows);
});

router.get('/stock/history', async (_req, res) => {
  const rows = await db.select().from(stockHistory).orderBy(desc(stockHistory.createdAt)).limit(200);
  res.json(rows);
});

router.get('/stock/waste', async (_req, res) => {
  const rows = await db.select().from(wasteLog).orderBy(desc(wasteLog.createdAt)).limit(200);
  res.json(rows);
});

router.post('/stock/:productId/entry', async (req, res) => {
  const { productId } = req.params;
  const { quantidade, motivo } = req.body;
  if (quantidade <= 0) {
    res.status(400).json({ error: 'Quantity must be positive' });
    return;
  }

  const [s] = await db.select().from(stock).where(eq(stock.productId, productId));
  if (!s) {
    res.status(404).json({ error: 'Stock item not found' });
    return;
  }

  const now = new Date();
  await db.update(stock).set({ quantidade: s.quantidade + quantidade, updatedAt: now }).where(eq(stock.productId, productId));
  const [entry] = await db
    .insert(stockHistory)
    .values({ id: uid(), productId, productName: s.name, quantidade, motivo, createdAt: now })
    .returning();
  res.status(201).json(entry);
});

router.patch('/stock/:productId/minimo', async (req, res) => {
  const { minimo } = req.body;
  const [updated] = await db
    .update(stock)
    .set({ minimo: Math.max(0, minimo), updatedAt: new Date() })
    .where(eq(stock.productId, req.params.productId))
    .returning();
  res.json(updated);
});

router.post('/stock/:productId/waste', async (req, res) => {
  const { productId } = req.params;
  const { quantidade, motivo } = req.body;
  if (quantidade <= 0) {
    res.status(400).json({ error: 'Quantity must be positive' });
    return;
  }

  const [s] = await db.select().from(stock).where(eq(stock.productId, productId));
  if (!s) {
    res.status(404).json({ error: 'Stock item not found' });
    return;
  }

  const now = new Date();
  await db.update(stock).set({ quantidade: Math.max(0, s.quantidade - quantidade), updatedAt: now }).where(eq(stock.productId, productId));
  const [entry] = await db
    .insert(wasteLog)
    .values({ id: uid(), productId, productName: s.name, quantidade, motivo, createdAt: now })
    .returning();
  res.status(201).json(entry);
});

export default router;
