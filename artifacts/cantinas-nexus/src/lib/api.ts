/**
 * Nexus-ERP-CRM — cliente da API
 * Todas as chamadas ao backend passam por aqui.
 *
 * Leitura pública (totem, acompanhamento) -> direto no Supabase via RLS.
 * Escrita e tudo que exige login da cozinha -> Edge Functions.
 */
import { supabase } from './supabase';

const TOKEN_KEY = 'nexus-erp-crm:employee-token';
const REFRESH_KEY = 'nexus-erp-crm:employee-refresh-token';
const EMPLOYEE_KEY = 'nexus-erp-crm:employee-profile';

async function getToken(): Promise<string | null> {
  const employeeToken = localStorage.getItem(TOKEN_KEY);
  if (employeeToken) return employeeToken;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function setSession(token: string, refreshToken?: string, employee?: ApiEmployee) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (employee) localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(employee));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EMPLOYEE_KEY);
}

function getSavedEmployee(): ApiEmployee | null {
  try {
    const value = localStorage.getItem(EMPLOYEE_KEY);
    return value ? JSON.parse(value) as ApiEmployee : null;
  } catch {
    clearSession();
    return null;
  }
}

/** Chama uma Edge Function autenticada (painel da cozinha). */
async function callFn<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const payload = await context.json().catch(() => null);
      throw new Error(payload?.error ?? error.message);
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T; // já vem em camelCase — as Edge Functions convertem antes de responder
}

/** Chama uma Edge Function pública (totem — sem login). */
async function callPublicFn<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const payload = await context.json().catch(() => null);
      throw new Error(payload?.error ?? error.message);
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T; // já vem em camelCase — as Edge Functions convertem antes de responder
}

// ---------------------------------------------------------------------------
// snake_case (Postgres) <-> camelCase (frontend)
// ---------------------------------------------------------------------------

function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function camelizeKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) return obj.map((v) => camelizeKeys(v)) as unknown as T;
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[toCamel(k)] = camelizeKeys(v);
    return out as T;
  }
  return obj as T;
}

async function publicSelect<T>(
  table: string,
  build?: (q: any) => any,
): Promise<T> {
  let query: any = supabase.from(table).select('*');
  if (build) query = build(query);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return camelizeKeys<T>(data ?? []);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type ProductCategory = 'lanche' | 'bebida' | 'combo';

export interface ApiProduct {
  id: string;
  name: string;
  price: string; // numeric from DB
  emoji: string;
  categoria: string;
  sazonal: boolean;
  disponivel: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export const api = {
  products: {
    list: () => publicSelect<ApiProduct[]>('products'),
    listForEmployee: () => callFn<ApiProduct[]>('gerenciar-dados', { action: 'list-products' }),
    create: (data: Omit<ApiProduct, 'createdAt' | 'updatedAt'> & { quantidadeInicial?: number }) =>
      callFn<ApiProduct>('gerenciar-dados', { action: 'create-product', ...data }),
    update: (id: string, data: Partial<ApiProduct>) =>
      callFn<ApiProduct>('gerenciar-dados', { action: 'update-product', id, ...data }),
    remove: (id: string) => callFn<{ ok: boolean }>('gerenciar-dados', { action: 'delete-product', id }),
    // Envia a imagem (já convertida para WebP) direto para o Supabase Storage.
    // Requer sessão autenticada (login da cozinha) — não passa por Edge Function.
    uploadImage: async (productId: string, file: File): Promise<string> => {
      const path = `${productId}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from('product-images').upload(path, file, {
        contentType: 'image/webp',
        upsert: true,
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      return data.publicUrl;
    },
  },

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------

  orders: {
    list: () => callFn<ApiOrder[]>('pedidos', { action: 'list' }),
    byCode: (token: string) => callPublicFn<ApiOrder>('pedidos', { action: 'track', token }),
    /*
      const { data, error } = await supabase.from('orders').select('*').eq('code', code).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Pedido não encontrado.');
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', data.id);
      return camelizeKeys<ApiOrder>({ ...data, items: items ?? [] });
    },*/
    checkout: (data: {
      establishmentId?: string;
      cartItems: Array<{ productId: string; qty: number }>;
      paymentMethod: string;
      observacoes: string;
      telefone: string;
    }) => callPublicFn<ApiOrder>('pedidos', { action: 'checkout', ...data }),
    manual: (data: {
      items: Array<{ productId: string; qty: number }>;
      paymentMethod: string;
      telefone: string;
      observacoes: string;
    }) => callFn<ApiOrder>('pedidos', { action: 'manual', ...data }),
    updateStatus: (id: string, status: string) => callFn<ApiOrder>('pedidos', { action: 'set-status', id, status }),
    advance: (id: string) => callFn<ApiOrder>('pedidos', { action: 'advance', id }),
    updateObservacoes: (id: string, observacoes: string) =>
      callFn<ApiOrder>('pedidos', { action: 'observacoes', id, observacoes }),
    confirmPickup: (code: string) =>
      callFn<{ ok: boolean; message: string }>('pedidos', { action: 'confirm-pickup', code }),
  },

  // ---------------------------------------------------------------------------
  // Stock
  // ---------------------------------------------------------------------------

  stock: {
    list: () => publicSelect<ApiStockItem[]>('stock'),
    history: () => callFn<ApiStockMovement[]>('gerenciar-dados', { action: 'report-stock-history' }),
    waste: async () => {
      const report = await callFn<ApiWasteReport>('gerenciar-dados', { action: 'report-waste' });
      return report.log;
    },
    addEntry: (productId: string, quantidade: number, motivo: string) =>
      callFn('estoque', { action: 'entry', productId, quantidade, motivo }),
    setMinimo: (productId: string, minimo: number) =>
      callFn('estoque', { action: 'set-minimo', productId, minimo }),
    addWaste: (productId: string, quantidade: number, motivo: string) =>
      callFn('estoque', { action: 'waste', productId, quantidade, motivo }),
  },

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  employees: {
    clearLocalSession: clearSession,
    getLocalEmployee: getSavedEmployee,
    list: () => callFn<ApiEmployee[]>('gerenciar-funcionarios', { action: 'list' }),
    login: async (username: string, password: string) => {
      const { data: result, error } = await supabase.functions.invoke('cozinha-login', {
        body: { username, password },
      });
      if (error) {
        const context = (error as { context?: Response }).context;
        const payload = context ? await context.json().catch(() => null) : null;
        if (payload?.code === 'not_employee') return { ok: false, code: 'not_employee' as const };
        if (context) return { ok: false, code: 'employee_login_failed' as const, message: payload?.error ?? 'Usuário ou senha inválidos.' };
        throw error;
      }
      if (result.ok && result.token) {
        setSession(result.token, result.refreshToken, result.employee);
        // Sincroniza o client Supabase com a sessão, necessário para operações
        // que passam direto pelo client (ex: upload de imagem no Storage) em
        // vez de por uma Edge Function.
        if (result.refreshToken) {
          await supabase.auth.setSession({ access_token: result.token, refresh_token: result.refreshToken });
        }
      }
      return result;
    },
    logout: () => {
      clearSession();
      supabase.auth.signOut();
    },
    create: (data: ApiEmployeeCreate) => callFn<ApiEmployee>('gerenciar-funcionarios', { action: 'create', ...data }),
    update: (id: string, data: ApiEmployeeUpdate) =>
      callFn<ApiEmployee>('gerenciar-funcionarios', { action: 'update', id, ...data }),
    remove: (id: string) => callFn<{ ok: boolean; message?: string }>('gerenciar-funcionarios', { action: 'delete', id }),
  },

  // ---------------------------------------------------------------------------
  // Promotions
  // ---------------------------------------------------------------------------

  promotions: {
    // Leitura pública (usada pelo totem para calcular preço com desconto) — via RLS, sem login.
    listActive: () => publicSelect<ApiPromotion[]>('promotions', (q) => q.eq('ativo', true)),
    // Listagem completa (inclusive inativas) — painel da cozinha, requer login.
    list: () => callFn<ApiPromotion[]>('promocoes', { action: 'list' }),
    create: (data: Omit<ApiPromotion, 'id' | 'createdAt'>) => callFn<ApiPromotion>('promocoes', { action: 'create', ...data }),
    update: (id: string, data: Partial<ApiPromotion>) => callFn<ApiPromotion>('promocoes', { action: 'update', id, ...data }),
    remove: (id: string) => callFn<{ ok: boolean }>('promocoes', { action: 'delete', id }),
  },

  // ---------------------------------------------------------------------------
  // Customers (CRM)
  // ---------------------------------------------------------------------------

  customers: {
    list: () => callFn<ApiCustomer[]>('clientes', { action: 'list' }),
    interactions: () => callFn<ApiCustomerInteraction[]>('clientes', { action: 'list-interactions' }),
    loyalty: () => callFn<ApiLoyaltyRecord[]>('clientes', { action: 'list-loyalty' }),
    // Leitura pública de UM registro por telefone — usada pelo totem, via RLS, sem login.
    // Não expõe a lista completa de clientes (privacidade).
    loyaltyByPhone: async (telefone: string) => {
      const { data, error } = await supabase.from('loyalty').select('*').eq('telefone', telefone).maybeSingle();
      if (error) throw new Error(error.message);
      return camelizeKeys<ApiLoyaltyRecord | null>(data);
    },
    get: (telefone: string) => callFn<ApiCustomer & { interactions: ApiCustomerInteraction[] }>('clientes', { action: 'get', telefone }),
    upsert: (telefone: string, data: Partial<ApiCustomer>) =>
      callFn<ApiCustomer>('clientes', { action: 'upsert', telefone, ...data }),
    remove: (telefone: string) => callFn<{ ok: boolean }>('clientes', { action: 'delete', telefone }),
    addInteraction: (telefone: string, tipo: string, nota: string) =>
      callFn<ApiCustomerInteraction>('clientes', { action: 'add-interaction', telefone, tipo, nota }),
  },

  // ---------------------------------------------------------------------------
  // Suppliers (ERP)
  // ---------------------------------------------------------------------------

  suppliers: {
    list: () => callFn<ApiSupplier[]>('fornecedores', { action: 'list' }),
    requests: () => callFn<ApiSupplyRequest[]>('fornecedores', { action: 'list-requests' }),
    create: (data: Omit<ApiSupplier, 'id' | 'createdAt' | 'updatedAt'>) =>
      callFn<ApiSupplier>('fornecedores', { action: 'create', ...data }),
    update: (id: string, data: Partial<ApiSupplier>) => callFn<ApiSupplier>('fornecedores', { action: 'update', id, ...data }),
    remove: (id: string) => callFn<{ ok: boolean }>('fornecedores', { action: 'delete', id }),
    createRequest: (data: { supplierId: string; insumo: string; quantidade: string; observacoes: string }) =>
      callFn<ApiSupplyRequest>('fornecedores', { action: 'create-request', ...data }),
    updateRequestStatus: (id: string, status: string) =>
      callFn<ApiSupplyRequest>('fornecedores', { action: 'update-request-status', id, status }),
    deleteRequest: (id: string) => callFn<{ ok: boolean }>('fornecedores', { action: 'delete-request', id }),
  },

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  settings: {
    get: async () => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
      if (error) throw new Error(error.message);
      return camelizeKeys<ApiSettings>(data);
    },
    getForEmployee: () => callFn<ApiSettings>('gerenciar-dados', { action: 'get-settings' }),
    update: (data: Partial<ApiSettings>) => callFn<ApiSettings>('gerenciar-dados', { action: 'update-settings', ...data }),
  },

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  reports: {
    daily: () => callFn<ApiDailyReport>('gerenciar-dados', { action: 'report-daily' }),
    products: () => callFn<ApiProductRanking[]>('gerenciar-dados', { action: 'report-products' }),
    hourly: () => callFn<ApiHourlyBucket[]>('gerenciar-dados', { action: 'report-hourly' }),
    transactions: () => callFn<ApiTransaction[]>('gerenciar-dados', { action: 'report-transactions' }),
    confirmTransaction: (id: string) => callFn<{ ok: boolean }>('gerenciar-dados', { action: 'confirm-transaction', id }),
    waste: () => callFn<ApiWasteReport>('gerenciar-dados', { action: 'report-waste' }),
    loyalty: () => callFn<ApiLoyaltyRecord[]>('gerenciar-dados', { action: 'report-loyalty' }),
    clearSales: () => callFn<{ ok: boolean }>('gerenciar-dados', { action: 'clear-sales' }),
  },
};

// ---------------------------------------------------------------------------
// Types (mirroring DB schema)
// ---------------------------------------------------------------------------

export interface ApiOrderItem {
  id: number;
  orderId: string;
  productId: string;
  name: string;
  price: string;
  qty: number;
}

export interface ApiOrder {
  id: string;
  trackingToken?: string;
  code: string;
  paymentCode: string;
  total: string;
  paymentMethod: string;
  status: string;
  observacoes: string;
  telefone: string;
  createdAt: string;
  updatedAt: string;
  items: ApiOrderItem[];
}

export interface ApiStockItem {
  productId: string;
  name: string;
  quantidade: number;
  minimo: number;
  updatedAt: string;
}

export interface ApiStockMovement {
  id: string;
  productId: string;
  productName: string;
  quantidade: number;
  motivo: string;
  createdAt: string;
}

export interface ApiWasteEntry {
  id: string;
  productId: string;
  productName: string;
  quantidade: number;
  motivo: string;
  createdAt: string;
}

export interface ApiEmployee {
  id: string;
  nome: string;
  username: string;
  role: string;
  horario: string;
  ativo: boolean;
  acessoCozinha: boolean;
  acessoCaixa: boolean;
  acessoAdm: boolean;
  createdAt: string;
}

export interface ApiEmployeeCreate {
  nome: string;
  username: string;
  password: string;
  role: string;
  horario: string;
  ativo: boolean;
  acessoCozinha: boolean;
  acessoCaixa: boolean;
  acessoAdm: boolean;
}

export type ApiEmployeeUpdate = Partial<Omit<ApiEmployeeCreate, 'password'>> & { password?: string };

export interface ApiPromotion {
  id: string;
  nome: string;
  tipo: string;
  valor: string;
  productIds: string[];
  ativo: boolean;
  createdAt: string;
}

export interface ApiCustomer {
  telefone: string;
  nome: string;
  tags: string[];
  observacoes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCustomerInteraction {
  id: string;
  telefone: string;
  tipo: string;
  nota: string;
  createdAt: string;
}

export interface ApiSupplier {
  id: string;
  nome: string;
  contato: string;
  telefone: string;
  email: string;
  insumos: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSupplyRequest {
  id: string;
  supplierId: string;
  insumo: string;
  quantidade: string;
  observacoes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiLoyaltyRecord {
  telefone: string;
  pedidos: number;
  updatedAt: string;
}

export interface ApiSettings {
  id: number;
  nomeLoja: string;
  whatsappNumero: string;
}

export interface ApiDailyReport {
  totalVendas: number;
  totalPendente: number;
  pagamentosPendentes: number;
  quantidadePedidos: number;
  ticketMedio: number;
  byMethod: Record<string, number>;
}

export interface ApiProductRanking {
  productId: string;
  name: string;
  qty: number;
  total: number;
}

export interface ApiHourlyBucket {
  hour: number;
  label: string;
  count: number;
}

export interface ApiTransaction {
  id: string;
  orderId: string;
  orderCode: string;
  method: string;
  valor: string;
  status: string;
  createdAt: string;
}

export interface ApiWasteReport {
  summary: Array<{ productId: string; productName: string; quantidade: number }>;
  log: ApiWasteEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const ATRASO_MS = 10 * 60 * 1000;

export function isOrderLate(order: ApiOrder): boolean {
  return (
    (order.status === 'recebido' || order.status === 'preparo') &&
    Date.now() - new Date(order.createdAt).getTime() > ATRASO_MS
  );
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  credito: 'Cartão de Crédito',
  debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro',
};

export const CATEGORY_LABELS: Record<string, string> = {
  lanche: 'Lanches',
  bebida: 'Bebidas',
  combo: 'Combos',
};

export const LOYALTY_THRESHOLD = 5;

export function computeLoyaltyStatus(telefone: string, loyalty: ApiLoyaltyRecord[]) {
  const record = loyalty.find((l) => l.telefone === telefone);
  const pedidos = record?.pedidos ?? 0;
  const restantes = LOYALTY_THRESHOLD - (pedidos % LOYALTY_THRESHOLD);
  const ganhouBrinde = pedidos > 0 && pedidos % LOYALTY_THRESHOLD === 0;
  return { pedidos, restantes: ganhouBrinde ? LOYALTY_THRESHOLD : restantes, ganhouBrinde };
}

export function getEffectivePrice(product: ApiProduct, promotions: ApiPromotion[]): { price: number; original: number; label: string | null } {
  const promo = promotions.find((p) => p.ativo && p.productIds.includes(product.id));
  if (!promo) return { price: Number(product.price), original: Number(product.price), label: null };
  const price =
    promo.tipo === 'percentual'
      ? Math.max(0, Number(product.price) * (1 - Number(promo.valor) / 100))
      : Math.max(0, Number(product.price) - Number(promo.valor));
  const label = promo.tipo === 'percentual' ? `-${promo.valor}%` : `-${formatCurrency(Number(promo.valor))}`;
  return { price, original: Number(product.price), label };
}

const PREP_TIME_MIN: Record<string, { min: number; max: number }> = {
  lanche: { min: 3, max: 5 },
  bebida: { min: 1, max: 2 },
  combo: { min: 4, max: 7 },
};

export function computeOrderEta(order: ApiOrder, products: ApiProduct[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const item of order.items) {
    const product = products.find((p) => p.id === item.productId);
    const time = product ? (PREP_TIME_MIN[product.categoria] ?? PREP_TIME_MIN.lanche) : PREP_TIME_MIN.lanche;
    min += time.min * item.qty;
    max += time.max * item.qty;
  }
  min = Math.max(2, Math.round(min * 0.6));
  max = Math.max(min + 1, Math.round(max * 0.7));
  return { min, max };
}

export function normalizePhoneIdentity(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  return digits;
}

export function computeCustomerInsights(
  orders: ApiOrder[],
  customers: ApiCustomer[]
): Array<{
  telefone: string;
  nome: string;
  tags: string[];
  observacoes: string;
  pedidos: number;
  totalGasto: number;
  ticketMedio: number;
  ultimoPedidoEm: number | null;
  diasSemComprar: number | null;
  status: 'novo' | 'ativo' | 'em-risco' | 'inativo';
}> {
  const map = new Map<string, { pedidos: number; total: number; ultimo: number }>();
  for (const order of orders) {
    const tel = normalizePhoneIdentity(order.telefone);
    if (!tel || order.status === 'cancelado') continue;
    const entry = map.get(tel) ?? { pedidos: 0, total: 0, ultimo: 0 };
    entry.pedidos += 1;
    entry.total += Number(order.total);
    entry.ultimo = Math.max(entry.ultimo, new Date(order.createdAt).getTime());
    map.set(tel, entry);
  }
  const customerByPhone = new Map<string, ApiCustomer>();
  for (const customer of customers) {
    const key = normalizePhoneIdentity(customer.telefone);
    if (!key) continue;
    const previous = customerByPhone.get(key);
    if (!previous || new Date(customer.updatedAt).getTime() > new Date(previous.updatedAt).getTime()) {
      customerByPhone.set(key, customer);
    }
  }
  const telefones = new Set<string>([...map.keys(), ...customerByPhone.keys()]);
  const now = Date.now();
  const result: ReturnType<typeof computeCustomerInsights> = [];
  for (const phoneKey of telefones) {
    const agg = map.get(phoneKey);
    const cadastro = customerByPhone.get(phoneKey);
    const telefone = cadastro?.telefone ?? phoneKey;
    const diasSemComprar = agg?.ultimo ? Math.floor((now - agg.ultimo) / (24 * 60 * 60 * 1000)) : null;
    let status: 'novo' | 'ativo' | 'em-risco' | 'inativo' = 'novo';
    if (agg) {
      if (diasSemComprar !== null && diasSemComprar > 30) status = 'inativo';
      else if (diasSemComprar !== null && diasSemComprar > 14) status = 'em-risco';
      else status = 'ativo';
    }
    result.push({
      telefone,
      nome: cadastro?.nome || '',
      tags: cadastro?.tags ?? [],
      observacoes: cadastro?.observacoes ?? '',
      pedidos: agg?.pedidos ?? 0,
      totalGasto: agg?.total ?? 0,
      ticketMedio: agg && agg.pedidos > 0 ? agg.total / agg.pedidos : 0,
      ultimoPedidoEm: agg?.ultimo ?? null,
      diasSemComprar,
      status,
    });
  }
  return result.sort((a, b) => b.totalGasto - a.totalGasto);
}
