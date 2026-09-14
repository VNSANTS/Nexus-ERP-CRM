/**
 * Cantinas Nexus — cliente da API REST
 * Todas as chamadas ao backend passam por aqui.
 */

const BASE = '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  // Remove leading slash if BASE already has trailing content
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
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
  createdAt: string;
  updatedAt: string;
}

export const api = {
  products: {
    list: () => req<ApiProduct[]>('/products'),
    create: (data: Omit<ApiProduct, 'createdAt' | 'updatedAt'>) =>
      req<ApiProduct>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ApiProduct>) =>
      req<ApiProduct>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => req<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
  },

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------

  orders: {
    list: () => req<ApiOrder[]>('/orders'),
    byCode: (code: string) => req<ApiOrder>(`/orders/by-code/${code}`),
    checkout: (data: {
      cartItems: Array<{ productId: string; qty: number }>;
      paymentMethod: string;
      observacoes: string;
      telefone: string;
    }) => req<ApiOrder>('/orders/checkout', { method: 'POST', body: JSON.stringify(data) }),
    manual: (data: {
      items: Array<{ productId: string; qty: number }>;
      paymentMethod: string;
      telefone: string;
      observacoes: string;
    }) => req<ApiOrder>('/orders/manual', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      req<ApiOrder>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    advance: (id: string) => req<ApiOrder>(`/orders/${id}/advance`, { method: 'POST' }),
    updateObservacoes: (id: string, observacoes: string) =>
      req<ApiOrder>(`/orders/${id}/observacoes`, { method: 'PATCH', body: JSON.stringify({ observacoes }) }),
    confirmPickup: (code: string) =>
      req<{ ok: boolean; message: string }>('/orders/confirm-pickup', { method: 'POST', body: JSON.stringify({ code }) }),
  },

  // ---------------------------------------------------------------------------
  // Stock
  // ---------------------------------------------------------------------------

  stock: {
    list: () => req<ApiStockItem[]>('/stock'),
    history: () => req<ApiStockMovement[]>('/stock/history'),
    waste: () => req<ApiWasteEntry[]>('/stock/waste'),
    addEntry: (productId: string, quantidade: number, motivo: string) =>
      req(`/stock/${productId}/entry`, { method: 'POST', body: JSON.stringify({ quantidade, motivo }) }),
    setMinimo: (productId: string, minimo: number) =>
      req(`/stock/${productId}/minimo`, { method: 'PATCH', body: JSON.stringify({ minimo }) }),
    addWaste: (productId: string, quantidade: number, motivo: string) =>
      req(`/stock/${productId}/waste`, { method: 'POST', body: JSON.stringify({ quantidade, motivo }) }),
  },

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  employees: {
    list: () => req<ApiEmployee[]>('/employees'),
    login: (username: string, password: string) =>
      req<{ ok: boolean; employee?: ApiEmployee; message?: string }>('/employees/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    create: (data: ApiEmployeeCreate) =>
      req<ApiEmployee>('/employees', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: ApiEmployeeUpdate) =>
      req<ApiEmployee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => req<{ ok: boolean; message?: string }>(`/employees/${id}`, { method: 'DELETE' }),
  },

  // ---------------------------------------------------------------------------
  // Promotions
  // ---------------------------------------------------------------------------

  promotions: {
    list: () => req<ApiPromotion[]>('/promotions'),
    create: (data: Omit<ApiPromotion, 'id' | 'createdAt'>) =>
      req<ApiPromotion>('/promotions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ApiPromotion>) =>
      req<ApiPromotion>(`/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => req<{ ok: boolean }>(`/promotions/${id}`, { method: 'DELETE' }),
  },

  // ---------------------------------------------------------------------------
  // Customers (CRM)
  // ---------------------------------------------------------------------------

  customers: {
    list: () => req<ApiCustomer[]>('/customers'),
    interactions: () => req<ApiCustomerInteraction[]>('/customers/interactions'),
    loyalty: () => req<ApiLoyaltyRecord[]>('/customers/loyalty'),
    get: (telefone: string) => req<ApiCustomer & { interactions: ApiCustomerInteraction[] }>(`/customers/${telefone}`),
    upsert: (telefone: string, data: Partial<ApiCustomer>) =>
      req<ApiCustomer>(`/customers/${telefone}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (telefone: string) => req<{ ok: boolean }>(`/customers/${telefone}`, { method: 'DELETE' }),
    addInteraction: (telefone: string, tipo: string, nota: string) =>
      req<ApiCustomerInteraction>(`/customers/${telefone}/interactions`, { method: 'POST', body: JSON.stringify({ tipo, nota }) }),
  },

  // ---------------------------------------------------------------------------
  // Suppliers (ERP)
  // ---------------------------------------------------------------------------

  suppliers: {
    list: () => req<ApiSupplier[]>('/suppliers'),
    requests: () => req<ApiSupplyRequest[]>('/suppliers/requests'),
    create: (data: Omit<ApiSupplier, 'id' | 'createdAt' | 'updatedAt'>) =>
      req<ApiSupplier>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ApiSupplier>) =>
      req<ApiSupplier>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => req<{ ok: boolean }>(`/suppliers/${id}`, { method: 'DELETE' }),
    createRequest: (data: { supplierId: string; insumo: string; quantidade: string; observacoes: string }) =>
      req<ApiSupplyRequest>('/suppliers/requests', { method: 'POST', body: JSON.stringify(data) }),
    updateRequestStatus: (id: string, status: string) =>
      req<ApiSupplyRequest>(`/suppliers/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    deleteRequest: (id: string) => req<{ ok: boolean }>(`/suppliers/requests/${id}`, { method: 'DELETE' }),
  },

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  settings: {
    get: () => req<ApiSettings>('/settings'),
    update: (data: Partial<ApiSettings>) =>
      req<ApiSettings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  reports: {
    daily: () => req<ApiDailyReport>('/reports/daily'),
    products: () => req<ApiProductRanking[]>('/reports/products'),
    hourly: () => req<ApiHourlyBucket[]>('/reports/hourly'),
    transactions: () => req<ApiTransaction[]>('/reports/transactions'),
    waste: () => req<ApiWasteReport>('/reports/waste'),
    loyalty: () => req<ApiLoyaltyRecord[]>('/reports/loyalty'),
    clearSales: () => req<{ ok: boolean }>('/reports/clear-sales', { method: 'POST' }),
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
  createdAt: string;
}

export interface ApiEmployeeCreate {
  nome: string;
  username: string;
  password: string;
  role: string;
  horario: string;
  ativo: boolean;
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
    const tel = order.telefone.trim();
    if (!tel || order.status === 'cancelado') continue;
    const entry = map.get(tel) ?? { pedidos: 0, total: 0, ultimo: 0 };
    entry.pedidos += 1;
    entry.total += Number(order.total);
    entry.ultimo = Math.max(entry.ultimo, new Date(order.createdAt).getTime());
    map.set(tel, entry);
  }
  const telefones = new Set<string>([...map.keys(), ...customers.map((c) => c.telefone)]);
  const now = Date.now();
  const result: ReturnType<typeof computeCustomerInsights> = [];
  for (const telefone of telefones) {
    const agg = map.get(telefone);
    const cadastro = customers.find((c) => c.telefone === telefone);
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
