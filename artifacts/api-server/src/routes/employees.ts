import { Router } from 'express';
import { db } from '@workspace/db';
import { employees } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const router = Router();
const scryptAsync = promisify(scrypt);

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith('scrypt$')) return stored === password;
  const [, salt, encodedKey] = stored.split('$');
  if (!salt || !encodedKey) return false;
  const expected = Buffer.from(encodedKey, 'hex');
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicEmployee(employee: typeof employees.$inferSelect) {
  const { password: _password, ...safeEmployee } = employee;
  return safeEmployee;
}

router.get('/employees', async (_req, res) => {
  const rows = await db.select().from(employees).orderBy(employees.createdAt);
  res.json(rows.map(publicEmployee));
});

router.post('/employees/login', async (req, res) => {
  const { username, password } = req.body;
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.username, username?.trim().toLowerCase()))
    .limit(1);
  if (!employee || !employee.ativo || typeof password !== 'string' || !(await verifyPassword(password, employee.password))) {
    res.status(401).json({ ok: false, message: 'Usuário ou senha inválidos.' });
    return;
  }
  if (!employee.password.startsWith('scrypt$')) {
    await db.update(employees).set({ password: await hashPassword(password) }).where(eq(employees.id, employee.id));
  }
  res.json({ ok: true, employee: publicEmployee(employee) });
});

router.post('/employees', async (req, res) => {
  const { nome, username, password, role, horario, ativo } = req.body;
  if (!nome || !username || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Nome, usuário e senha com pelo menos 6 caracteres são obrigatórios.' });
    return;
  }
  const [emp] = await db
    .insert(employees)
    .values({ id: uid(), nome, username: username.trim().toLowerCase(), password: await hashPassword(password), role: role ?? 'funcionario', horario: horario ?? '', ativo: ativo !== false })
    .returning();
  res.status(201).json(publicEmployee(emp));
});

router.patch('/employees/:id', async (req, res) => {
  const { nome, username, password, role, horario, ativo } = req.body;
  const updates: Record<string, unknown> = {};
  if (nome != null) updates.nome = nome;
  if (username != null) updates.username = username.trim().toLowerCase();
  if (password != null && password !== '') {
    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    updates.password = await hashPassword(password);
  }
  if (role != null) updates.role = role;
  if (horario != null) updates.horario = horario;
  if (ativo != null) updates.ativo = ativo;

  const [updated] = await db.update(employees).set(updates).where(eq(employees.id, req.params.id)).returning();
  if (!updated) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(publicEmployee(updated));
});

router.delete('/employees/:id', async (req, res) => {
  const { id } = req.params;
  const allAdmins = await db.select().from(employees).where(eq(employees.role, 'admin'));
  const target = allAdmins.find((e) => e.id === id);
  if (target && allAdmins.filter((e) => e.ativo).length <= 1) {
    res.status(400).json({ ok: false, message: 'É preciso manter ao menos um administrador ativo.' });
    return;
  }
  await db.delete(employees).where(eq(employees.id, id));
  res.json({ ok: true });
});

export default router;
