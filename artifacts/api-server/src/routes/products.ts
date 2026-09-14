import { Router } from 'express';
import { db } from '@workspace/db';
import { products, stock } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/products', async (req, res) => {
  const rows = await db.select().from(products).orderBy(products.createdAt);
  res.json(rows);
});

router.post('/products', async (req, res) => {
  const { id, name, price, emoji, categoria, sazonal, disponivel } = req.body;
  if (!id || !name || price == null || !emoji || !categoria) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  const [product] = await db
    .insert(products)
    .values({ id, name, price: String(price), emoji, categoria, sazonal: !!sazonal, disponivel: disponivel !== false })
    .returning();
  // Create stock entry
  await db.insert(stock).values({ productId: id, name, quantidade: 0, minimo: 5 }).onConflictDoNothing();
  res.status(201).json(product);
});

router.patch('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price, emoji, categoria, sazonal, disponivel } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name != null) updates.name = name;
  if (price != null) updates.price = String(price);
  if (emoji != null) updates.emoji = emoji;
  if (categoria != null) updates.categoria = categoria;
  if (sazonal != null) updates.sazonal = sazonal;
  if (disponivel != null) updates.disponivel = disponivel;

  const [updated] = await db.update(products).set(updates).where(eq(products.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  if (name != null) {
    await db.update(stock).set({ name }).where(eq(stock.productId, id));
  }
  res.json(updated);
});

router.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  await db.delete(products).where(eq(products.id, id));
  res.json({ ok: true });
});

export default router;
