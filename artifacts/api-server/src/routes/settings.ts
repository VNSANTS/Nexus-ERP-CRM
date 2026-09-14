import { Router } from 'express';
import { db } from '@workspace/db';
import { settings } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/settings', async (_req, res) => {
  const [s] = await db.select().from(settings).where(eq(settings.id, 1));
  res.json(s ?? { id: 1, nomeLoja: 'Cantinas Nexus', whatsappNumero: '5511999999999' });
});

router.patch('/settings', async (req, res) => {
  const { nomeLoja, whatsappNumero } = req.body;
  const updates: Record<string, unknown> = {};
  if (nomeLoja != null) updates.nomeLoja = nomeLoja;
  if (whatsappNumero != null) updates.whatsappNumero = whatsappNumero;

  const existing = await db.select().from(settings).where(eq(settings.id, 1));
  if (existing.length === 0) {
    const [created] = await db.insert(settings).values({ id: 1, ...updates } as { id: number; nomeLoja: string; whatsappNumero: string }).returning();
    res.json(created);
    return;
  }
  const [updated] = await db.update(settings).set(updates).where(eq(settings.id, 1)).returning();
  res.json(updated);
});

export default router;
