import { Router } from 'express';
import { db } from '@workspace/db';
import { customers, customerInteractions, loyalty } from '@workspace/db/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

router.get('/customers', async (_req, res) => {
  const rows = await db.select().from(customers).orderBy(desc(customers.updatedAt));
  res.json(rows);
});

router.get('/customers/interactions', async (_req, res) => {
  const rows = await db.select().from(customerInteractions).orderBy(desc(customerInteractions.createdAt)).limit(500);
  res.json(rows);
});

router.get('/customers/loyalty', async (_req, res) => {
  const rows = await db.select().from(loyalty);
  res.json(rows);
});

router.get('/customers/:telefone', async (req, res) => {
  const [customer] = await db.select().from(customers).where(eq(customers.telefone, req.params.telefone));
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  const interactions = await db.select().from(customerInteractions).where(eq(customerInteractions.telefone, req.params.telefone)).orderBy(desc(customerInteractions.createdAt));
  res.json({ ...customer, interactions });
});

router.put('/customers/:telefone', async (req, res) => {
  const tel = req.params.telefone.trim();
  const { nome, tags, observacoes } = req.body;
  const now = new Date();
  const [existing] = await db.select().from(customers).where(eq(customers.telefone, tel));
  if (existing) {
    const updates: Record<string, unknown> = { updatedAt: now };
    if (nome != null) updates.nome = nome;
    if (tags != null) updates.tags = tags;
    if (observacoes != null) updates.observacoes = observacoes;
    const [updated] = await db.update(customers).set(updates).where(eq(customers.telefone, tel)).returning();
    res.json(updated);
    return;
  }
  const [created] = await db
    .insert(customers)
    .values({ telefone: tel, nome: nome ?? '', tags: tags ?? [], observacoes: observacoes ?? '', createdAt: now, updatedAt: now })
    .returning();
  res.status(201).json(created);
});

router.delete('/customers/:telefone', async (req, res) => {
  await db.delete(customers).where(eq(customers.telefone, req.params.telefone));
  res.json({ ok: true });
});

router.post('/customers/:telefone/interactions', async (req, res) => {
  const tel = req.params.telefone.trim();
  const { tipo, nota } = req.body;
  const now = new Date();

  // Ensure customer exists
  const [existing] = await db.select().from(customers).where(eq(customers.telefone, tel));
  if (!existing) {
    await db.insert(customers).values({ telefone: tel, nome: '', tags: [], observacoes: '', createdAt: now, updatedAt: now });
  }

  const [interaction] = await db
    .insert(customerInteractions)
    .values({ id: uid(), telefone: tel, tipo, nota: nota.trim(), createdAt: now })
    .returning();
  res.status(201).json(interaction);
});

export default router;
