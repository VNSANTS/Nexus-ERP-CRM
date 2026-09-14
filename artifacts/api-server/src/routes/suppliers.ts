import { Router } from 'express';
import { db } from '@workspace/db';
import { suppliers, supplyRequests } from '@workspace/db/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

router.get('/suppliers', async (_req, res) => {
  const rows = await db.select().from(suppliers).orderBy(suppliers.createdAt);
  res.json(rows);
});

router.get('/suppliers/requests', async (_req, res) => {
  const rows = await db.select().from(supplyRequests).orderBy(desc(supplyRequests.createdAt));
  res.json(rows);
});

router.post('/suppliers', async (req, res) => {
  const { nome, contato, telefone, email, insumos } = req.body;
  const now = new Date();
  const [supplier] = await db
    .insert(suppliers)
    .values({ id: uid(), nome, contato, telefone, email, insumos, createdAt: now, updatedAt: now })
    .returning();
  res.status(201).json(supplier);
});

router.patch('/suppliers/:id', async (req, res) => {
  const { nome, contato, telefone, email, insumos } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (nome != null) updates.nome = nome;
  if (contato != null) updates.contato = contato;
  if (telefone != null) updates.telefone = telefone;
  if (email != null) updates.email = email;
  if (insumos != null) updates.insumos = insumos;
  const [updated] = await db.update(suppliers).set(updates).where(eq(suppliers.id, req.params.id)).returning();
  if (!updated) {
    res.status(404).json({ error: 'Supplier not found' });
    return;
  }
  res.json(updated);
});

router.delete('/suppliers/:id', async (req, res) => {
  await db.delete(suppliers).where(eq(suppliers.id, req.params.id));
  res.json({ ok: true });
});

router.post('/suppliers/requests', async (req, res) => {
  const { supplierId, insumo, quantidade, observacoes } = req.body;
  const now = new Date();
  const [req2] = await db
    .insert(supplyRequests)
    .values({ id: uid(), supplierId, insumo, quantidade, observacoes: observacoes ?? '', status: 'pendente', createdAt: now, updatedAt: now })
    .returning();
  res.status(201).json(req2);
});

router.patch('/suppliers/requests/:id', async (req, res) => {
  const { status } = req.body;
  const [updated] = await db
    .update(supplyRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(supplyRequests.id, req.params.id))
    .returning();
  res.json(updated);
});

router.delete('/suppliers/requests/:id', async (req, res) => {
  await db.delete(supplyRequests).where(eq(supplyRequests.id, req.params.id));
  res.json({ ok: true });
});

export default router;
