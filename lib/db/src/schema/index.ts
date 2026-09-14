import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  serial,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  emoji: text('emoji').notNull(),
  categoria: text('categoria').notNull(), // 'lanche' | 'bebida' | 'combo'
  sazonal: boolean('sazonal').notNull().default(false),
  disponivel: boolean('disponivel').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({ createdAt: true, updatedAt: true });
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

// ---------------------------------------------------------------------------
// Orders + OrderItems
// ---------------------------------------------------------------------------

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  paymentCode: text('payment_code').notNull(),
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull(),
  status: text('status').notNull().default('recebido'),
  observacoes: text('observacoes').notNull().default(''),
  telefone: text('telefone').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  qty: integer('qty').notNull(),
});

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export const stock = pgTable('stock', {
  productId: text('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantidade: integer('quantidade').notNull().default(0),
  minimo: integer('minimo').notNull().default(5),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const stockHistory = pgTable('stock_history', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  quantidade: integer('quantidade').notNull(),
  motivo: text('motivo').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const wasteLog = pgTable('waste_log', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  quantidade: integer('quantidade').notNull(),
  motivo: text('motivo').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type StockItem = typeof stock.$inferSelect;
export type StockMovement = typeof stockHistory.$inferSelect;
export type WasteEntry = typeof wasteLog.$inferSelect;

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull().default('funcionario'),
  horario: text('horario').notNull().default(''),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Employee = typeof employees.$inferSelect;

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export const promotions = pgTable('promotions', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  tipo: text('tipo').notNull(), // 'percentual' | 'fixo'
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull(),
  productIds: text('product_ids').array().notNull().default([]),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Promotion = typeof promotions.$inferSelect;

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  orderCode: text('order_code').notNull(),
  method: text('method').notNull(),
  valor: numeric('valor', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull().default('confirmado'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Transaction = typeof transactions.$inferSelect;

// ---------------------------------------------------------------------------
// Customers (CRM)
// ---------------------------------------------------------------------------

export const customers = pgTable('customers', {
  telefone: text('telefone').primaryKey(),
  nome: text('nome').notNull().default(''),
  tags: text('tags').array().notNull().default([]),
  observacoes: text('observacoes').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const customerInteractions = pgTable('customer_interactions', {
  id: text('id').primaryKey(),
  telefone: text('telefone').notNull(),
  tipo: text('tipo').notNull(), // 'ligacao' | 'whatsapp' | 'presencial' | 'outro'
  nota: text('nota').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Customer = typeof customers.$inferSelect;
export type CustomerInteraction = typeof customerInteractions.$inferSelect;

// ---------------------------------------------------------------------------
// Suppliers + Supply Requests (ERP)
// ---------------------------------------------------------------------------

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  contato: text('contato').notNull(),
  telefone: text('telefone').notNull(),
  email: text('email').notNull(),
  insumos: text('insumos').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const supplyRequests = pgTable('supply_requests', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  insumo: text('insumo').notNull(),
  quantidade: text('quantidade').notNull(),
  observacoes: text('observacoes').notNull().default(''),
  status: text('status').notNull().default('pendente'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type SupplyRequest = typeof supplyRequests.$inferSelect;

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------

export const loyalty = pgTable('loyalty', {
  telefone: text('telefone').primaryKey(),
  pedidos: integer('pedidos').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type LoyaltyRecord = typeof loyalty.$inferSelect;

// ---------------------------------------------------------------------------
// Settings (single row, id always = 1)
// ---------------------------------------------------------------------------

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  nomeLoja: text('nome_loja').notNull().default('Cantinas Nexus'),
  whatsappNumero: text('whatsapp_numero').notNull().default('5511999999999'),
});

export type Settings = typeof settings.$inferSelect;

// ---------------------------------------------------------------------------
// Daily Counter
// ---------------------------------------------------------------------------

export const dailyCounter = pgTable('daily_counter', {
  date: text('date').primaryKey(), // yyyy-mm-dd
  count: integer('count').notNull().default(0),
});

export type DailyCounter = typeof dailyCounter.$inferSelect;
