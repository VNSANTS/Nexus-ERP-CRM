import { Router } from 'express';
import { db } from '@workspace/db';
import { promotions } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

router.get('/promotions', async (_req, res) => {
  const rows = await db.select().from(promotions).orderBy(promotions.createdAt);
  res.json(rows);
});

router.post('/promotions', async (req, res) => {
  const { nome, tipo, valor, productIds, ativo } = req.body;
  const [promo] = await db
    .insert(promotions)
    .values({ id: uid(), nome, tipo, valor: String(valor), productIds: productIds ?? [], ativo: ativo !== false })
    .returning();
  res.status(201).json(promo);
});

router.patch('/promotions/:id', async (req, res) => {
  const { nome, tipo, valor, productIds, ativo } = req.body;
  const updates: Record<string, unknown> = {};
  if (nome != null) updates.nome = nome;
  if (tipo != null) updates.tipo = tipo;
  if (valor != null) updates.valor = String(valor);
  if (productIds != null) updates.productIds = productIds;
  if (ativo != null) updates.ativo = ativo;

  const [updated] = await db.update(promotions).set(updates).where(eq(promotions.id, req.params.id)).returning();
  if (!updated) {
    res.status(404).json({ error: 'Promotion not found' });
    return;
  }
  res.json(updated);
});

router.delete('/promotions/:id', async (req, res) => {
  await db.delete(promotions).where(eq(promotions.id, req.params.id));
  res.json({ ok: true });
});

export default router;
