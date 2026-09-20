import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  api, formatCurrency, isOrderLate, computeOrderEta, computeCustomerInsights,
  PAYMENT_LABELS, CATEGORY_LABELS,
  type ApiOrder, type ApiProduct, type ApiEmployee, type ApiStockItem,
  type ApiPromotion, type ApiCustomer, type ApiCustomerInteraction,
  type ApiSupplier, type ApiSupplyRequest, type ApiTransaction,
} from '../lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChefHat, LayoutDashboard, Package, BarChart3, Users, Truck,
  LogOut, Settings, ClipboardList, Plus, Minus, Trash2, X,
  Check, AlertTriangle, Clock, TrendingUp, ShoppingBag,
  Phone, MessageCircle, Tag, Star, Edit2, Save, RefreshCw,
  Loader2, ArrowRight, ChevronDown, ChevronUp, Banknote,
  CreditCard, Wallet, QrCode, UserPlus, FileText, Download,
  ToggleLeft, ToggleRight, Eye, EyeOff, Search, Filter,
  ArrowLeft, ShieldCheck, DollarSign, Activity, Calendar,
} from 'lucide-react';
import { downloadCsv } from '../lib/csv';
import { convertImageToWebp } from '../lib/image-convert';

// ─── types ───────────────────────────────────────────────────────────────────

type KitchenTab =
  | 'pedidos' | 'caixa' | 'tarefas' | 'estoque'
  | 'dashboard' | 'relatorios' | 'crm' | 'fornecedores'
  | 'produtos' | 'promocoes' | 'funcionarios' | 'configuracoes';

type KitchenMode = 'funcionario' | 'admin';

// ─── helpers ─────────────────────────────────────────────────────────────────

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    recebido: 'bg-amber-100 text-amber-800 border-amber-300',
    preparo: 'bg-blue-100 text-blue-800 border-blue-300',
    pronto: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    retirado: 'bg-gray-100 text-gray-600 border-gray-300',
    cancelado: 'bg-red-100 text-red-700 border-red-300',
  };
  const labels: Record<string, string> = {
    recebido: 'Recebido', preparo: 'Em Preparo', pronto: 'Pronto!',
    retirado: 'Retirado', cancelado: 'Cancelado',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider ${map[status] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}>
      {labels[status] ?? status}
    </span>
  );
}

const PAYMENT_ICON: Record<string, typeof QrCode> = {
  pix: QrCode, credito: CreditCard, debito: Wallet, dinheiro: Banknote,
};

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (emp: ApiEmployee) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: () => api.employees.login(username, password),
    onSuccess: (data) => {
      if (data.ok && data.employee) { onLogin(data.employee); }
      else { setError(data.message ?? 'Usuário ou senha inválidos.'); }
    },
    onError: () => setError('Erro de conexão. Verifique a rede.'),
  });

  return (
    <div className="nexus-noise min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
         className="nexus-surface rounded-[2.5rem] p-8 sm:p-12 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
           <div className="w-20 h-20 bg-primary text-white rounded-[1.5rem] flex items-center justify-center text-xl font-display font-black mb-5 shadow-xl">CN</div>
           <h1 className="text-3xl sm:text-4xl font-display font-black text-foreground">Painel Nexus</h1>
          <p className="text-gray-500 font-medium mt-1">Acesso exclusivo para equipe.</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); setError(''); loginMutation.mutate(); }} className="space-y-5">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Usuário</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoComplete="username"
              className="w-full border-2 border-gray-200 rounded-2xl px-5 py-4 text-lg font-bold focus:border-primary focus:outline-none transition-colors" />
          </div>
          <div className="relative">
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Senha</label>
            <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
              className="w-full border-2 border-gray-200 rounded-2xl px-5 py-4 text-lg font-bold pr-14 focus:border-primary focus:outline-none transition-colors" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-4 bottom-4 text-gray-400 hover:text-gray-700 transition-colors">
              {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {error && <p className="text-red-600 font-bold text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

          <button type="submit" disabled={loginMutation.isPending}
            className="w-full bg-primary text-white py-5 rounded-2xl font-black text-xl shadow-xl hover:bg-orange-600 transition-colors active:scale-95 disabled:opacity-70 flex items-center justify-center gap-3">
            {loginMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : null}
            Acessar Painel
          </button>
        </form>

        <button onClick={() => window.history.back()}
          className="w-full mt-4 flex items-center justify-center gap-2 text-gray-400 hover:text-gray-700 font-bold py-3 rounded-2xl hover:bg-gray-100 transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" /> Voltar ao Totem
        </button>

      </motion.div>
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, products, onAdvance, onCancel, onUpdateObs }: {
  order: ApiOrder;
  products: ApiProduct[];
  onAdvance: (id: string) => void;
  onCancel: (id: string) => void;
  onUpdateObs: (id: string, obs: string) => void;
}) {
  const [editingObs, setEditingObs] = useState(false);
  const [obs, setObs] = useState(order.observacoes);
  const [expanded, setExpanded] = useState(false);
  const late = isOrderLate(order);
  const eta = order.status === 'recebido' || order.status === 'preparo' ? computeOrderEta(order, products) : null;

  const borderColor = {
    recebido: 'border-l-amber-400',
    preparo: 'border-l-blue-500',
    pronto: 'border-l-emerald-500',
    retirado: 'border-l-gray-300',
    cancelado: 'border-l-red-400',
  }[order.status] ?? 'border-l-gray-300';

  const canAdvance = ['recebido', 'preparo', 'pronto'].includes(order.status);
  const PayIcon = PAYMENT_ICON[order.paymentMethod] ?? Banknote;

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      className={`bg-white rounded-2xl shadow-md border-l-4 ${borderColor} overflow-hidden`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl font-display font-black text-primary shrink-0">#{order.code}</span>
            <div className="min-w-0">
              <StatusBadge status={order.status} />
              {late && (
                <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                  className="ml-2 text-xs font-black text-red-600 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">ATRASADO</motion.span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PayIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-bold text-gray-500">{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {order.items.map((item, i) => (
            <span key={i} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-bold">
              {item.qty}× {item.name}
            </span>
          ))}
        </div>

        {order.observacoes && !editingObs && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 flex items-start gap-2">
            <FileText className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-amber-800 text-sm font-medium">{order.observacoes}</p>
          </div>
        )}

        {editingObs && (
          <div className="mb-3 flex gap-2">
            <input value={obs} onChange={(e) => setObs(e.target.value)}
              className="flex-1 border-2 border-primary rounded-xl px-3 py-2 text-sm font-medium focus:outline-none" />
            <button onClick={() => { onUpdateObs(order.id, obs); setEditingObs(false); }}
              className="bg-primary text-white px-3 py-2 rounded-xl hover:bg-orange-600 transition-colors">
              <Save className="w-4 h-4" />
            </button>
            <button onClick={() => { setObs(order.observacoes); setEditingObs(false); }}
              className="bg-gray-100 text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-lg font-black text-gray-900">{formatCurrency(Number(order.total))}</span>
            {eta && <span className="text-xs text-gray-400 font-bold flex items-center gap-1"><Clock className="w-3 h-3" />{eta.min}–{eta.max}min</span>}
            {order.telefone && <span className="text-xs text-gray-400 font-bold flex items-center gap-1"><Phone className="w-3 h-3" />{order.telefone}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditingObs(!editingObs)} title="Editar observações"
              className="p-2 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-lg transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={() => setExpanded(!expanded)}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {order.status !== 'cancelado' && order.status !== 'retirado' && (
              <button onClick={() => onCancel(order.id)} title="Cancelar pedido"
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
            {canAdvance && (
              <button onClick={() => onAdvance(order.id)}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors active:scale-95">
                Avançar <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
            <p>Criado: {new Date(order.createdAt).toLocaleString('pt-BR')}</p>
            <p>Código de pagamento: <code className="font-mono">{order.paymentCode}</code></p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Kitchen Component ───────────────────────────────────────────────────

export function Kitchen() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [loggedEmployee, setLoggedEmployee] = useState<ApiEmployee | null>(null);
  const [kitchenMode, setKitchenMode] = useState<KitchenMode>('funcionario');
  const [activeTab, setActiveTab] = useState<KitchenTab>('pedidos');
  const [pickupCode, setPickupCode] = useState('');
  const [pickupMsg, setPickupMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['orders'],
    queryFn: api.orders.list,
    refetchInterval: 4000,
    enabled: !!loggedEmployee,
  });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: api.products.list, enabled: !!loggedEmployee });
  const { data: stock = [] } = useQuery({ queryKey: ['stock'], queryFn: api.stock.list, refetchInterval: 15000, enabled: !!loggedEmployee });
  const { data: stockHistory = [] } = useQuery({ queryKey: ['stock-history'], queryFn: api.stock.history, enabled: !!loggedEmployee && activeTab === 'estoque' });
  const { data: wasteLog = [] } = useQuery({ queryKey: ['waste-log'], queryFn: api.stock.waste, enabled: !!loggedEmployee && activeTab === 'estoque' });
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: api.employees.list, enabled: !!loggedEmployee && kitchenMode === 'admin' });
  const { data: promotions = [] } = useQuery({ queryKey: ['promotions'], queryFn: api.promotions.list, enabled: !!loggedEmployee });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: api.customers.list, enabled: !!loggedEmployee && activeTab === 'crm' });
  const { data: interactions = [] } = useQuery({ queryKey: ['customer-interactions'], queryFn: api.customers.interactions, enabled: !!loggedEmployee && activeTab === 'crm' });
  const { data: loyaltyData = [] } = useQuery({ queryKey: ['loyalty'], queryFn: api.customers.loyalty, enabled: !!loggedEmployee });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: api.suppliers.list, enabled: !!loggedEmployee && activeTab === 'fornecedores' });
  const { data: supplyRequests = [] } = useQuery({ queryKey: ['supply-requests'], queryFn: api.suppliers.requests, enabled: !!loggedEmployee && activeTab === 'fornecedores' });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, enabled: !!loggedEmployee });
  const { data: dailyReport } = useQuery({ queryKey: ['report-daily'], queryFn: api.reports.daily, refetchInterval: 10000, enabled: !!loggedEmployee });
  const { data: productRanking = [] } = useQuery({ queryKey: ['report-products'], queryFn: api.reports.products, refetchInterval: 15000, enabled: !!loggedEmployee && (activeTab === 'dashboard' || activeTab === 'relatorios') });
  const { data: hourlyData = [] } = useQuery({ queryKey: ['report-hourly'], queryFn: api.reports.hourly, refetchInterval: 15000, enabled: !!loggedEmployee && (activeTab === 'dashboard' || activeTab === 'relatorios') });
  const { data: transactions = [] } = useQuery({ queryKey: ['transactions'], queryFn: api.reports.transactions, enabled: !!loggedEmployee && activeTab === 'relatorios' });
  const { data: wasteReport } = useQuery({ queryKey: ['waste-report'], queryFn: api.reports.waste, enabled: !!loggedEmployee && activeTab === 'relatorios' });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const advanceMut = useMutation({ mutationFn: api.orders.advance, onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }) });
  const cancelMut = useMutation({
    mutationFn: (id: string) => api.orders.updateStatus(id, 'cancelado'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
  const updateObsMut = useMutation({
    mutationFn: ({ id, obs }: { id: string; obs: string }) => api.orders.updateObservacoes(id, obs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
  const confirmPickupMut = useMutation({
    mutationFn: (code: string) => api.orders.confirmPickup(code),
    onSuccess: (data) => { setPickupMsg(data); if (data.ok) { setPickupCode(''); qc.invalidateQueries({ queryKey: ['orders'] }); } },
  });

  // ─── Caixa Rápido state ──────────────────────────────────────────────────────

  const [manualItems, setManualItems] = useState<Record<string, number>>({});
  const [manualPayment, setManualPayment] = useState('dinheiro');
  const [manualTelefone, setManualTelefone] = useState('');
  const [manualObs, setManualObs] = useState('');

  const manualMut = useMutation({
    mutationFn: () => api.orders.manual({
      items: Object.entries(manualItems).filter(([, q]) => q > 0).map(([productId, qty]) => ({ productId, qty })),
      paymentMethod: manualPayment,
      telefone: manualTelefone,
      observacoes: manualObs,
    }),
    onSuccess: (order) => {
      toast.success(`Pedido #${order.code} criado!`);
      setManualItems({});
      setManualTelefone('');
      setManualObs('');
      qc.invalidateQueries({ queryKey: ['orders', 'stock', 'loyalty'] });
    },
    onError: () => toast.error('Erro ao criar pedido.'),
  });

  // ─── Stock forms ─────────────────────────────────────────────────────────────

  const [stockEntry, setStockEntry] = useState<{ productId: string; quantidade: number; motivo: string } | null>(null);
  const [wasteEntry, setWasteEntry] = useState<{ productId: string; quantidade: number; motivo: string } | null>(null);

  const stockEntryMut = useMutation({
    mutationFn: () => api.stock.addEntry(stockEntry!.productId, stockEntry!.quantidade, stockEntry!.motivo),
    onSuccess: () => { toast.success('Estoque atualizado!'); setStockEntry(null); qc.invalidateQueries({ queryKey: ['stock', 'stock-history'] }); },
  });
  const wasteMut = useMutation({
    mutationFn: () => api.stock.addWaste(wasteEntry!.productId, wasteEntry!.quantidade, wasteEntry!.motivo),
    onSuccess: () => { toast.success('Desperdício registrado.'); setWasteEntry(null); qc.invalidateQueries({ queryKey: ['stock', 'waste-log', 'waste-report'] }); },
  });
  const minimoMut = useMutation({
    mutationFn: ({ productId, minimo }: { productId: string; minimo: number }) => api.stock.setMinimo(productId, minimo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock'] }),
  });

  // ─── Product forms ───────────────────────────────────────────────────────────

  const [productForm, setProductForm] = useState<{ id?: string; name: string; price: string; emoji: string; categoria: string; sazonal: boolean; disponivel: boolean; imageUrl: string | null; quantidadeInicial?: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const createProductMut = useMutation({
    mutationFn: () => {
      const id = productForm!.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid().slice(0, 4);
      return productForm!.id
        ? api.products.update(productForm!.id, { name: productForm!.name, price: productForm!.price, emoji: productForm!.emoji, categoria: productForm!.categoria, sazonal: productForm!.sazonal, disponivel: productForm!.disponivel, imageUrl: productForm!.imageUrl })
        : api.products.create({ id, name: productForm!.name, price: productForm!.price, emoji: productForm!.emoji, categoria: productForm!.categoria, sazonal: productForm!.sazonal, disponivel: productForm!.disponivel, imageUrl: productForm!.imageUrl, quantidadeInicial: Number(productForm!.quantidadeInicial ?? 0) });
    },
    onSuccess: () => { toast.success('Produto salvo!'); setProductForm(null); qc.invalidateQueries({ queryKey: ['products', 'stock'] }); },
  });
  const removeProductMut = useMutation({ mutationFn: api.products.remove, onSuccess: () => qc.invalidateQueries({ queryKey: ['products', 'stock'] }) });
  const toggleProductMut = useMutation({
    mutationFn: ({ id, disponivel }: { id: string; disponivel: boolean }) => api.products.update(id, { disponivel }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  // ─── Promotion forms ─────────────────────────────────────────────────────────

  const [promoForm, setPromoForm] = useState<{ id?: string; nome: string; tipo: string; valor: string; productIds: string[]; ativo: boolean } | null>(null);
  const savePromoMut = useMutation({
    mutationFn: () => promoForm!.id
      ? api.promotions.update(promoForm!.id, { nome: promoForm!.nome, tipo: promoForm!.tipo, valor: promoForm!.valor, productIds: promoForm!.productIds, ativo: promoForm!.ativo })
      : api.promotions.create({ nome: promoForm!.nome, tipo: promoForm!.tipo, valor: promoForm!.valor, productIds: promoForm!.productIds, ativo: promoForm!.ativo }),
    onSuccess: () => { toast.success('Promoção salva!'); setPromoForm(null); qc.invalidateQueries({ queryKey: ['promotions'] }); },
  });
  const removePromoMut = useMutation({ mutationFn: api.promotions.remove, onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }) });

  // ─── Employee forms ──────────────────────────────────────────────────────────

  const [empForm, setEmpForm] = useState<{ id?: string; nome: string; username: string; password: string; role: string; horario: string; ativo: boolean } | null>(null);
  const saveEmpMut = useMutation({
    mutationFn: () => {
      const { id, password, ...employeeFields } = empForm!;
      if (id) {
        return api.employees.update(id, password.trim() ? { ...employeeFields, password } : employeeFields);
      }
      return api.employees.create({ ...employeeFields, password });
    },
    onSuccess: () => { toast.success('Funcionário salvo!'); setEmpForm(null); qc.invalidateQueries({ queryKey: ['employees'] }); },
    onError: (e: any) => toast.error(e.message ?? 'Erro ao salvar.'),
  });
  const removeEmpMut = useMutation({
    mutationFn: api.employees.remove,
    onSuccess: (data) => { if (!data.ok) { toast.error(data.message ?? 'Erro.'); } qc.invalidateQueries({ queryKey: ['employees'] }); },
  });

  // ─── CRM forms ───────────────────────────────────────────────────────────────

  const [crmTab, setCrmTab] = useState<'clientes' | 'interacoes'>('clientes');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [interactionForm, setInteractionForm] = useState<{ tipo: string; nota: string } | null>(null);
  const [customerForm, setCustomerForm] = useState<{ telefone: string; nome: string; tags: string; observacoes: string } | null>(null);

  const addInteractionMut = useMutation({
    mutationFn: () => api.customers.addInteraction(selectedCustomer!, interactionForm!.tipo, interactionForm!.nota),
    onSuccess: () => { toast.success('Interação registrada!'); setInteractionForm(null); qc.invalidateQueries({ queryKey: ['customer-interactions', 'customers'] }); },
  });
  const upsertCustomerMut = useMutation({
    mutationFn: () => api.customers.upsert(customerForm!.telefone, { nome: customerForm!.nome, tags: customerForm!.tags.split(',').map((t) => t.trim()).filter(Boolean), observacoes: customerForm!.observacoes }),
    onSuccess: () => { toast.success('Cliente salvo!'); setCustomerForm(null); qc.invalidateQueries({ queryKey: ['customers'] }); },
  });

  // ─── Supplier forms ──────────────────────────────────────────────────────────

  const [supplierForm, setSupplierForm] = useState<{ id?: string; nome: string; contato: string; telefone: string; email: string; insumos: string } | null>(null);
  const [supplyReqForm, setSupplyReqForm] = useState<{ supplierId: string; insumo: string; quantidade: string; observacoes: string } | null>(null);

  const saveSupplierMut = useMutation({
    mutationFn: () => supplierForm!.id
      ? api.suppliers.update(supplierForm!.id, supplierForm!)
      : api.suppliers.create(supplierForm! as any),
    onSuccess: () => { toast.success('Fornecedor salvo!'); setSupplierForm(null); qc.invalidateQueries({ queryKey: ['suppliers'] }); },
  });
  const createSupplyReqMut = useMutation({
    mutationFn: () => api.suppliers.createRequest(supplyReqForm!),
    onSuccess: () => { toast.success('Pedido de compra criado!'); setSupplyReqForm(null); qc.invalidateQueries({ queryKey: ['supply-requests'] }); },
  });
  const updateSupplyStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.suppliers.updateRequestStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supply-requests'] }),
  });

  // ─── Settings ────────────────────────────────────────────────────────────────

  const [settingsForm, setSettingsForm] = useState<{ nomeLoja: string; whatsappNumero: string } | null>(null);
  const saveSettingsMut = useMutation({
    mutationFn: () => api.settings.update(settingsForm!),
    onSuccess: () => { toast.success('Configurações salvas!'); setSettingsForm(null); qc.invalidateQueries({ queryKey: ['settings'] }); },
  });
  const clearSalesMut = useMutation({
    mutationFn: api.reports.clearSales,
    onSuccess: () => { toast.success('Histórico limpo.'); qc.invalidateQueries({ queryKey: ['orders', 'transactions', 'report-daily', 'report-products', 'report-hourly'] }); },
  });

  // ─── derived data ────────────────────────────────────────────────────────────

  const todayOrders = orders.filter((o: ApiOrder) => {
    const d = new Date(o.createdAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });

  const activeOrders = todayOrders.filter((o: ApiOrder) => !['retirado', 'cancelado'].includes(o.status));
  const lowStockItems = stock.filter((s: ApiStockItem) => s.quantidade <= s.minimo);
  const customerInsights = computeCustomerInsights(orders, customers);

  const manualTotal = Object.entries(manualItems)
    .filter(([, q]) => q > 0)
    .reduce((sum, [pid, qty]) => {
      const p = products.find((x: ApiProduct) => x.id === pid);
      return sum + (p ? Number(p.price) * qty : 0);
    }, 0);

  // ─── Login guard ─────────────────────────────────────────────────────────────

  if (!loggedEmployee) {
    return <LoginScreen onLogin={(emp) => { setLoggedEmployee(emp); setKitchenMode(emp.role as KitchenMode); }} />;
  }

  // ─── Navigation tabs ─────────────────────────────────────────────────────────

  const TABS_FUNCIONARIO: Array<{ key: KitchenTab; label: string; icon: typeof ChefHat }> = [
    { key: 'pedidos', label: 'Pedidos', icon: ClipboardList },
    { key: 'caixa', label: 'Caixa Rápido', icon: ShoppingBag },
    { key: 'tarefas', label: 'Tarefas', icon: ChefHat },
    { key: 'estoque', label: 'Estoque', icon: Package },
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const TABS_ADMIN: Array<{ key: KitchenTab; label: string; icon: typeof ChefHat }> = [
    ...TABS_FUNCIONARIO,
    { key: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    { key: 'crm', label: 'CRM', icon: Users },
    { key: 'fornecedores', label: 'Fornecedores', icon: Truck },
    { key: 'produtos', label: 'Produtos', icon: Tag },
    { key: 'promocoes', label: 'Promoções', icon: Star },
    { key: 'funcionarios', label: 'Funcionários', icon: UserPlus },
    { key: 'configuracoes', label: 'Configurações', icon: Settings },
  ];

  const tabs = kitchenMode === 'admin' ? TABS_ADMIN : TABS_FUNCIONARIO;

  // ─── Layout ──────────────────────────────────────────────────────────────────

  return (
     <div className="nexus-noise min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
       <header className="bg-[#172333] text-white px-4 sm:px-6 py-3 flex items-center justify-between gap-4 shrink-0 shadow-xl z-20">
        <div className="flex items-center gap-3 min-w-0">
           <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-xs font-black shrink-0 shadow-lg">CN</div>
          <div className="min-w-0">
            <h1 className="font-black text-base sm:text-lg leading-tight truncate">{settings?.nomeLoja ?? 'Cantinas Nexus'}</h1>
            <p className="text-gray-400 text-xs font-bold truncate">{loggedEmployee.nome} · {loggedEmployee.role === 'admin' ? 'Admin' : 'Equipe'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {loadingOrders && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          {activeOrders.length > 0 && (
            <div className="bg-primary text-white text-xs font-black px-3 py-1.5 rounded-full shadow">{activeOrders.length} ativos</div>
          )}
          {lowStockItems.length > 0 && (
            <div className="bg-red-600 text-white text-xs font-black px-3 py-1.5 rounded-full shadow flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />{lowStockItems.length} estoque
            </div>
          )}
          {loggedEmployee.role === 'admin' && (
            <button onClick={() => setKitchenMode(kitchenMode === 'admin' ? 'funcionario' : 'admin')}
              title={kitchenMode === 'admin' ? 'Modo Equipe' : 'Modo Admin'}
              className="p-2 rounded-xl hover:bg-gray-700 transition-colors text-gray-300 hover:text-white">
              {kitchenMode === 'admin' ? <ShieldCheck className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
          )}
          <button onClick={() => { setLoggedEmployee(null); setActiveTab('pedidos'); }}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-colors text-sm font-bold">
            <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* Tab nav */}
       <nav className="bg-card border-b border-border px-2 sm:px-4 overflow-x-auto flex gap-1 sm:gap-2 hide-scrollbar shrink-0 shadow-sm z-10">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm font-black whitespace-nowrap border-b-2 transition-all ${isActive ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* Main content */}
       <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* ── PEDIDOS ── */}
        {activeTab === 'pedidos' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-2xl font-display font-black text-gray-900">Pedidos de Hoje</h2>
              <div className="flex items-center gap-3">
                <button onClick={() => qc.invalidateQueries({ queryKey: ['orders'] })} className="p-2 text-gray-500 hover:text-primary hover:bg-orange-50 rounded-xl transition-colors"><RefreshCw className="w-5 h-5" /></button>
                {/* Pickup by code */}
                <div className="flex items-center gap-2">
                  <input value={pickupCode} onChange={(e) => { setPickupCode(e.target.value); setPickupMsg(null); }}
                    placeholder="Código retirada" className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold w-32 focus:border-primary focus:outline-none" />
                  <button onClick={() => confirmPickupMut.mutate(pickupCode)} disabled={!pickupCode || confirmPickupMut.isPending}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {confirmPickupMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            {pickupMsg && (
              <div className={`p-4 rounded-2xl font-bold ${pickupMsg.ok ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-700 border border-red-300'}`}>
                {pickupMsg.message}
              </div>
            )}

            {['recebido', 'preparo', 'pronto', 'retirado', 'cancelado'].map((status) => {
              const statusOrders = todayOrders.filter((o: ApiOrder) => o.status === status);
              if (statusOrders.length === 0) return null;
              return (
                <div key={status}>
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <StatusBadge status={status} /> ({statusOrders.length})
                  </h3>
                  <div className="space-y-3">
                    <AnimatePresence>
                      {statusOrders.map((o: ApiOrder) => (
                        <OrderCard key={o.id} order={o} products={products}
                          onAdvance={(id) => advanceMut.mutate(id)}
                          onCancel={(id) => { if (confirm('Cancelar pedido?')) cancelMut.mutate(id); }}
                          onUpdateObs={(id, obs) => updateObsMut.mutate({ id, obs })} />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
            {todayOrders.length === 0 && !loadingOrders && (
              <div className="text-center py-20 text-gray-400">
                <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-xl font-bold">Nenhum pedido hoje ainda.</p>
              </div>
            )}
          </div>
        )}

        {/* ── CAIXA RÁPIDO ── */}
        {activeTab === 'caixa' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-2xl font-display font-black text-gray-900">Caixa Rápido</h2>
            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.filter((p: ApiProduct) => p.disponivel).map((p: ApiProduct) => {
                  const qty = manualItems[p.id] ?? 0;
                  return (
                    <div key={p.id} className={`border-2 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all ${qty > 0 ? 'border-primary bg-orange-50' : 'border-gray-200'}`}>
                      <span className="text-4xl">{p.emoji}</span>
                      <p className="font-bold text-sm text-center text-gray-800">{p.name}</p>
                      <p className="text-primary font-black text-sm">{formatCurrency(Number(p.price))}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => setManualItems((m) => ({ ...m, [p.id]: Math.max(0, (m[p.id] ?? 0) - 1) }))}
                          className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-black w-6 text-center">{qty}</span>
                        <button onClick={() => setManualItems((m) => ({ ...m, [p.id]: (m[p.id] ?? 0) + 1 }))}
                          className="w-8 h-8 bg-primary hover:bg-orange-600 rounded-lg flex items-center justify-center text-white transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1">Forma de Pagamento</label>
                  <select value={manualPayment} onChange={(e) => setManualPayment(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1">Telefone (opcional)</label>
                  <input value={manualTelefone} onChange={(e) => setManualTelefone(e.target.value)} placeholder="(11) 99999-9999"
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1">Observações</label>
                <input value={manualObs} onChange={(e) => setManualObs(e.target.value)} placeholder="Sem cebola, etc."
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                <div>
                  <p className="text-gray-500 font-bold text-sm">Total</p>
                  <p className="text-3xl font-black text-primary">{formatCurrency(manualTotal)}</p>
                </div>
                <button onClick={() => manualMut.mutate()}
                  disabled={manualTotal === 0 || manualMut.isPending}
                  className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {manualMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : null} Confirmar Pedido
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAREFAS (prep queue) ── */}
        {activeTab === 'tarefas' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-display font-black text-gray-900">Fila de Preparo</h2>
            {activeOrders.length === 0 ? (
              <div className="text-center py-20 text-gray-400 bg-white rounded-2xl shadow-sm">
                <ChefHat className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-xl font-bold">Nenhum pedido na fila.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeOrders.sort((a: ApiOrder, b: ApiOrder) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map((o: ApiOrder) => {
                  const late = isOrderLate(o);
                  const eta = computeOrderEta(o, products);
                  return (
                    <div key={o.id} className={`bg-white rounded-2xl shadow-sm p-5 border-l-4 ${late ? 'border-l-red-500' : o.status === 'preparo' ? 'border-l-blue-500' : 'border-l-amber-400'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-3xl font-display font-black text-primary">#{o.code}</span>
                            <StatusBadge status={o.status} />
                            {late && <span className="text-xs font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-full border border-red-300">ATRASADO</span>}
                          </div>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {o.items.map((item, i) => (
                              <span key={i} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-bold">{item.qty}× {item.name}</span>
                            ))}
                          </div>
                           {o.observacoes && <p className="text-sm text-amber-700 font-medium bg-amber-50 px-3 py-1 rounded-lg">{o.observacoes}</p>}
                          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> ETA: {eta.min}–{eta.max}min · {new Date(o.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <button onClick={() => advanceMut.mutate(o.id)}
                          className="bg-primary text-white px-4 py-3 rounded-xl font-black text-sm hover:bg-orange-600 transition-colors flex items-center gap-2 shrink-0">
                          {o.status === 'recebido' ? 'Iniciar' : o.status === 'preparo' ? 'Pronto' : 'Entregar'} <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ESTOQUE ── */}
        {activeTab === 'estoque' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-2xl font-display font-black text-gray-900">Estoque</h2>
              <div className="flex gap-2">
                <button onClick={() => setStockEntry({ productId: stock[0]?.productId ?? '', quantidade: 1, motivo: 'Reposição' })}
                  className="bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Entrada
                </button>
                <button onClick={() => setWasteEntry({ productId: stock[0]?.productId ?? '', quantidade: 1, motivo: 'Vencido' })}
                  className="bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-colors flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Desperdício
                </button>
              </div>
            </div>

            {lowStockItems.length > 0 && (
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-red-700 mb-1">Estoque Crítico</p>
                  <p className="text-red-600 text-sm font-medium">{lowStockItems.map((s: ApiStockItem) => s.name).join(', ')}</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Produto', 'Qtd', 'Mínimo', 'Status', 'Ações'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stock.map((s: ApiStockItem) => {
                    const low = s.quantidade <= s.minimo;
                    return (
                      <tr key={s.productId} className={low ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3 font-bold text-gray-900">{s.name}</td>
                        <td className="px-4 py-3 font-black text-lg text-gray-800">{s.quantidade}</td>
                        <td className="px-4 py-3">
                          <input type="number" defaultValue={s.minimo} min={0}
                            onBlur={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v !== s.minimo) minimoMut.mutate({ productId: s.productId, minimo: v }); }}
                            className="w-16 border-2 border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-center focus:border-primary focus:outline-none" />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-black ${low ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {low ? 'CRÍTICO' : 'OK'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => setStockEntry({ productId: s.productId, quantidade: 1, motivo: 'Reposição' })}
                              className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-bold hover:bg-orange-600 transition-colors">+Entrada</button>
                            <button onClick={() => setWasteEntry({ productId: s.productId, quantidade: 1, motivo: 'Vencido' })}
                              className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-600 transition-colors">Desperdício</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {stockHistory.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-black text-gray-700 mb-4 flex items-center gap-2"><Activity className="w-4 h-4" /> Histórico de Movimentos</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {stockHistory.slice(0, 30).map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                      <span className="font-medium text-gray-700">{m.productName} · <span className="text-gray-400">{m.motivo}</span></span>
                      <span className={`font-black ${m.quantidade > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {m.quantidade > 0 ? '+' : ''}{m.quantidade}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stock entry modal */}
            {stockEntry && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
                  <h3 className="text-xl font-black mb-5">Entrada de Estoque</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Produto</label>
                      <select value={stockEntry.productId} onChange={(e) => setStockEntry({ ...stockEntry, productId: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                        {stock.map((s: ApiStockItem) => <option key={s.productId} value={s.productId}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Quantidade</label>
                      <input type="number" min={1} value={stockEntry.quantidade} onChange={(e) => setStockEntry({ ...stockEntry, quantidade: parseInt(e.target.value) || 1 })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Motivo</label>
                      <input value={stockEntry.motivo} onChange={(e) => setStockEntry({ ...stockEntry, motivo: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setStockEntry(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50 transition-colors">Cancelar</button>
                      <button onClick={() => stockEntryMut.mutate()} disabled={stockEntryMut.isPending}
                        className="flex-1 py-3 bg-primary text-white rounded-xl font-black hover:bg-orange-600 transition-colors disabled:opacity-50">
                        {stockEntryMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {wasteEntry && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
                  <h3 className="text-xl font-black mb-5">Registrar Desperdício</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Produto</label>
                      <select value={wasteEntry.productId} onChange={(e) => setWasteEntry({ ...wasteEntry, productId: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                        {stock.map((s: ApiStockItem) => <option key={s.productId} value={s.productId}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Quantidade desperdiçada</label>
                      <input type="number" min={1} value={wasteEntry.quantidade} onChange={(e) => setWasteEntry({ ...wasteEntry, quantidade: parseInt(e.target.value) || 1 })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Motivo</label>
                      <select value={wasteEntry.motivo} onChange={(e) => setWasteEntry({ ...wasteEntry, motivo: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                        {['Vencido', 'Acidente', 'Qualidade', 'Sobra', 'Outro'].map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setWasteEntry(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50 transition-colors">Cancelar</button>
                      <button onClick={() => wasteMut.mutate()} disabled={wasteMut.isPending}
                        className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 transition-colors disabled:opacity-50">
                        {wasteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Registrar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <h2 className="text-2xl font-display font-black text-gray-900">Dashboard de Hoje</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Faturamento', value: formatCurrency(dailyReport?.totalVendas ?? 0), icon: DollarSign, color: 'bg-emerald-500' },
                { label: 'Pedidos', value: dailyReport?.quantidadePedidos ?? 0, icon: ShoppingBag, color: 'bg-blue-500' },
                { label: 'Ticket Médio', value: formatCurrency(dailyReport?.ticketMedio ?? 0), icon: TrendingUp, color: 'bg-primary' },
                { label: 'Ativos Agora', value: activeOrders.length, icon: Activity, color: 'bg-amber-500' },
              ].map((card) => (
                <div key={card.label} className="bg-white rounded-2xl shadow-sm p-5">
                  <div className={`w-10 h-10 ${card.color} text-white rounded-xl flex items-center justify-center mb-3`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">{card.label}</p>
                  <p className="text-2xl font-black text-gray-900">{card.value}</p>
                </div>
              ))}
            </div>

            {/* Payment breakdown */}
            {dailyReport?.byMethod && Object.keys(dailyReport.byMethod).length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-black text-gray-700 mb-4">Por Forma de Pagamento</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {Object.entries(dailyReport.byMethod).map(([method, total]) => {
                    const PayIcon = PAYMENT_ICON[method] ?? Banknote;
                    return (
                      <div key={method} className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                        <PayIcon className="w-5 h-5 text-gray-500" />
                        <div>
                          <p className="text-xs font-black text-gray-400 uppercase">{PAYMENT_LABELS[method] ?? method}</p>
                          <p className="font-black text-gray-900">{formatCurrency(total)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top products */}
            {productRanking.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-black text-gray-700 mb-4">Top Produtos</h3>
                <div className="space-y-2">
                  {productRanking.slice(0, 5).map((p: any, i: number) => (
                    <div key={p.productId} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <span className="w-6 font-black text-gray-400 text-sm">#{i + 1}</span>
                      <span className="flex-1 font-bold text-gray-800">{p.name}</span>
                      <span className="text-sm font-bold text-gray-500">{p.qty} un</span>
                      <span className="font-black text-primary">{formatCurrency(p.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hourly */}
            {hourlyData.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-black text-gray-700 mb-4">Pedidos por Hora</h3>
                <div className="flex items-end gap-2 h-24">
                  {hourlyData.map((b: any) => {
                    const max = Math.max(...hourlyData.map((x: any) => x.count), 1);
                    const pct = (b.count / max) * 100;
                    return (
                      <div key={b.hour} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-black text-gray-500">{b.count}</span>
                        <div className="w-full rounded-t-lg bg-primary transition-all" style={{ height: `${pct}%`, minHeight: 4 }} />
                        <span className="text-[10px] font-bold text-gray-400">{b.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stock alerts */}
            {lowStockItems.length > 0 && (
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5">
                <h3 className="font-black text-red-700 mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Alertas de Estoque</h3>
                <div className="space-y-2">
                  {lowStockItems.map((s: ApiStockItem) => (
                    <div key={s.productId} className="flex justify-between items-center">
                      <span className="font-bold text-red-800">{s.name}</span>
                      <span className="text-sm font-bold text-red-600">{s.quantidade} un (mín: {s.minimo})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RELATÓRIOS ── */}
        {activeTab === 'relatorios' && kitchenMode === 'admin' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-2xl font-display font-black text-gray-900">Relatórios</h2>
              <div className="flex gap-2">
                <button onClick={() => {
                  const rows = [['Código', 'Status', 'Pagamento', 'Total', 'Criado'], ...todayOrders.map((o: ApiOrder) => [o.code, o.status, o.paymentMethod, o.total, new Date(o.createdAt).toLocaleString('pt-BR')])];
                  downloadCsv(`pedidos-${new Date().toISOString().slice(0, 10)}.csv`, rows);
                }} className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-gray-700 transition-colors">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
                <button onClick={() => { if (confirm('Apagar todo o histórico de vendas do dia?')) clearSalesMut.mutate(); }}
                  className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-colors">
                  <Trash2 className="w-4 h-4" /> Limpar Histórico
                </button>
              </div>
            </div>

            {/* Transactions table */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-black text-gray-700">Transações do Dia</h3>
                <span className="text-sm font-bold text-gray-400">{transactions.filter((t: ApiTransaction) => {
                  const d = new Date(t.createdAt); const now = new Date();
                  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
                }).length} transações</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Pedido', 'Pagamento', 'Valor', 'Status', 'Hora'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transactions.slice(0, 50).map((t: ApiTransaction) => (
                      <tr key={t.id}>
                        <td className="px-4 py-3 font-black text-gray-900">#{t.orderCode}</td>
                        <td className="px-4 py-3 font-bold text-gray-600">{PAYMENT_LABELS[t.method] ?? t.method}</td>
                        <td className="px-4 py-3 font-black text-primary">{formatCurrency(Number(t.valor))}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-black ${t.status === 'estornado' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{t.status}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400 font-medium">{new Date(t.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Waste report */}
            {wasteReport && wasteReport.summary.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-black text-gray-700 mb-4">Resumo de Desperdícios</h3>
                <div className="space-y-2">
                  {wasteReport.summary.map((w: any) => (
                    <div key={w.productId} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                      <span className="font-bold text-gray-800">{w.productName}</span>
                      <span className="font-black text-red-600">{w.quantidade} un</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CRM ── */}
        {activeTab === 'crm' && kitchenMode === 'admin' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-2xl font-display font-black text-gray-900">CRM — Clientes</h2>
              <button onClick={() => setCustomerForm({ telefone: '', nome: '', tags: '', observacoes: '' })}
                className="bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> Novo Cliente
              </button>
            </div>

            <div className="flex gap-2 bg-white rounded-2xl shadow-sm p-1 w-fit">
              {(['clientes', 'interacoes'] as const).map((t) => (
                <button key={t} onClick={() => setCrmTab(t)}
                  className={`px-5 py-2 rounded-xl font-bold text-sm transition-all ${crmTab === t ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-800'}`}>
                  {t === 'clientes' ? 'Clientes' : 'Interações'}
                </button>
              ))}
            </div>

            {crmTab === 'clientes' && (
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar cliente por nome ou telefone..."
                    className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 font-medium focus:border-primary focus:outline-none" />
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customerInsights
                    .filter((c) => !searchQuery || c.nome.toLowerCase().includes(searchQuery.toLowerCase()) || c.telefone.includes(searchQuery))
                    .slice(0, 30)
                    .map((c) => (
                      <div key={c.telefone} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-black text-gray-900">{c.nome || 'Sem nome'}</p>
                            <p className="text-sm text-gray-400 font-medium flex items-center gap-1"><Phone className="w-3 h-3" />{c.telefone}</p>
                          </div>
                          <span className={`text-xs font-black px-2 py-1 rounded-full border ${
                            c.status === 'ativo' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                            c.status === 'em-risco' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                            c.status === 'inativo' ? 'bg-red-100 text-red-700 border-red-300' :
                            'bg-gray-100 text-gray-600 border-gray-300'}`}>
                            {c.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-gray-50 rounded-xl p-2">
                            <p className="text-xs text-gray-400 font-bold">Pedidos</p>
                            <p className="font-black text-gray-900">{c.pedidos}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-2">
                            <p className="text-xs text-gray-400 font-bold">Total</p>
                            <p className="font-black text-primary text-xs">{formatCurrency(c.totalGasto)}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-2">
                            <p className="text-xs text-gray-400 font-bold">Ticket</p>
                            <p className="font-black text-gray-900 text-xs">{formatCurrency(c.ticketMedio)}</p>
                          </div>
                        </div>
                        {c.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {c.tags.map((tag) => <span key={tag} className="bg-orange-100 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{tag}</span>)}
                          </div>
                        )}
                        {c.diasSemComprar !== null && c.diasSemComprar > 0 && (
                          <p className="text-xs text-gray-400 font-medium">Última compra: {c.diasSemComprar} dias atrás</p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => { setSelectedCustomer(c.telefone); setInteractionForm({ tipo: 'whatsapp', nota: '' }); }}
                            className="flex-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg py-2 font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1">
                            <MessageCircle className="w-3 h-3" /> Interação
                          </button>
                          <button onClick={() => setCustomerForm({ telefone: c.telefone, nome: c.nome, tags: c.tags.join(', '), observacoes: c.observacoes })}
                            className="flex-1 text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-lg py-2 font-bold hover:bg-gray-100 transition-colors flex items-center justify-center gap-1">
                            <Edit2 className="w-3 h-3" /> Editar
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {crmTab === 'interacoes' && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>{['Telefone', 'Tipo', 'Nota', 'Data'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {interactions.slice(0, 50).map((i: ApiCustomerInteraction) => (
                      <tr key={i.id}>
                        <td className="px-4 py-3 font-bold text-gray-800">{i.telefone}</td>
                        <td className="px-4 py-3"><span className="bg-blue-100 text-blue-700 text-xs font-black px-2 py-0.5 rounded-full">{i.tipo}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-medium max-w-xs truncate">{i.nota}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 font-medium">{new Date(i.createdAt).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Customer form modal */}
            {customerForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-black mb-5">{customerForm.telefone ? 'Editar Cliente' : 'Novo Cliente'}</h3>
                  <div className="space-y-4">
                    {!customerForm.telefone.startsWith('+') && (
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Telefone</label>
                        <input value={customerForm.telefone} onChange={(e) => setCustomerForm({ ...customerForm, telefone: e.target.value })}
                          placeholder="11999999999" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Nome</label>
                      <input value={customerForm.nome} onChange={(e) => setCustomerForm({ ...customerForm, nome: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Tags (separadas por vírgula)</label>
                      <input value={customerForm.tags} onChange={(e) => setCustomerForm({ ...customerForm, tags: e.target.value })}
                        placeholder="VIP, Escola, Frequente" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Observações</label>
                      <textarea value={customerForm.observacoes} onChange={(e) => setCustomerForm({ ...customerForm, observacoes: e.target.value })}
                        rows={3} className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none resize-none" />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setCustomerForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => upsertCustomerMut.mutate()} disabled={upsertCustomerMut.isPending || !customerForm.telefone}
                        className="flex-1 py-3 bg-primary text-white rounded-xl font-black hover:bg-orange-600 disabled:opacity-50">
                        {upsertCustomerMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Interaction modal */}
            {interactionForm && selectedCustomer && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
                  <h3 className="text-xl font-black mb-1">Nova Interação</h3>
                  <p className="text-gray-400 font-bold text-sm mb-5">{selectedCustomer}</p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Tipo</label>
                      <select value={interactionForm.tipo} onChange={(e) => setInteractionForm({ ...interactionForm, tipo: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                        {['ligacao', 'whatsapp', 'presencial', 'outro'].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Nota</label>
                      <textarea value={interactionForm.nota} onChange={(e) => setInteractionForm({ ...interactionForm, nota: e.target.value })}
                        rows={3} placeholder="O que foi discutido?" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none resize-none" />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => { setInteractionForm(null); setSelectedCustomer(null); }} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => addInteractionMut.mutate()} disabled={addInteractionMut.isPending || !interactionForm.nota}
                        className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 disabled:opacity-50">
                        {addInteractionMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FORNECEDORES ── */}
        {activeTab === 'fornecedores' && kitchenMode === 'admin' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-2xl font-display font-black text-gray-900">ERP — Fornecedores</h2>
              <div className="flex gap-2">
                <button onClick={() => setSupplyReqForm({ supplierId: suppliers[0]?.id ?? '', insumo: '', quantidade: '', observacoes: '' })}
                  className="bg-amber-500 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-amber-600 transition-colors flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Pedido de Compra
                </button>
                <button onClick={() => setSupplierForm({ nome: '', contato: '', telefone: '', email: '', insumos: '' })}
                  className="bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Fornecedor
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {suppliers.map((s: ApiSupplier) => (
                <div key={s.id} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-black text-gray-900">{s.nome}</p>
                      <p className="text-sm text-gray-500 font-medium">{s.contato}</p>
                    </div>
                    <button onClick={() => setSupplierForm({ id: s.id, nome: s.nome, contato: s.contato, telefone: s.telefone, email: s.email, insumos: s.insumos })}
                      className="p-2 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-xl transition-colors"><Edit2 className="w-4 h-4" /></button>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2 text-gray-600"><Phone className="w-3 h-3" />{s.telefone}</p>
                    <p className="flex items-center gap-2 text-gray-600">✉️ {s.email}</p>
                    <p className="text-gray-500"><span className="font-bold">Insumos:</span> {s.insumos}</p>
                  </div>
                  <button onClick={() => setSupplyReqForm({ supplierId: s.id, insumo: '', quantidade: '', observacoes: '' })}
                    className="w-full text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-xl py-2 font-bold hover:bg-amber-100 transition-colors flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" /> Novo Pedido de Compra
                  </button>
                </div>
              ))}
            </div>

            {/* Supply requests */}
            {supplyRequests.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="font-black text-gray-700">Pedidos de Compra</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>{['Fornecedor', 'Insumo', 'Qtd', 'Status', 'Ações'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {supplyRequests.map((r: ApiSupplyRequest) => {
                      const sup = suppliers.find((s: ApiSupplier) => s.id === r.supplierId);
                      return (
                        <tr key={r.id}>
                          <td className="px-4 py-3 font-bold text-gray-800 text-sm">{sup?.nome ?? '—'}</td>
                          <td className="px-4 py-3 font-medium text-gray-700 text-sm">{r.insumo}</td>
                          <td className="px-4 py-3 font-bold text-gray-600 text-sm">{r.quantidade}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-black px-2 py-1 rounded-full ${r.status === 'atendido' ? 'bg-emerald-100 text-emerald-700' : r.status === 'cancelado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            {r.status === 'pendente' && (
                              <div className="flex gap-2">
                                <button onClick={() => updateSupplyStatusMut.mutate({ id: r.id, status: 'atendido' })}
                                  className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-2 py-1 font-bold hover:bg-emerald-100">Atendido</button>
                                <button onClick={() => updateSupplyStatusMut.mutate({ id: r.id, status: 'cancelado' })}
                                  className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1 font-bold hover:bg-red-100">Cancelar</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Supplier form modal */}
            {supplierForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-black mb-5">{(supplierForm as any).id ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
                  <div className="space-y-4">
                    {(['nome', 'contato', 'telefone', 'email', 'insumos'] as const).map((field) => (
                      <div key={field}>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">{field}</label>
                        <input value={(supplierForm as any)[field]} onChange={(e) => setSupplierForm({ ...supplierForm!, [field]: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                      </div>
                    ))}
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setSupplierForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => saveSupplierMut.mutate()} disabled={saveSupplierMut.isPending}
                        className="flex-1 py-3 bg-primary text-white rounded-xl font-black hover:bg-orange-600 disabled:opacity-50">
                        {saveSupplierMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Supply request form modal */}
            {supplyReqForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
                  <h3 className="text-xl font-black mb-5">Pedido de Compra</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Fornecedor</label>
                      <select value={supplyReqForm.supplierId} onChange={(e) => setSupplyReqForm({ ...supplyReqForm, supplierId: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                        {suppliers.map((s: ApiSupplier) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </div>
                    {(['insumo', 'quantidade', 'observacoes'] as const).map((field) => (
                      <div key={field}>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">{field}</label>
                        <input value={supplyReqForm[field]} onChange={(e) => setSupplyReqForm({ ...supplyReqForm, [field]: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                      </div>
                    ))}
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setSupplyReqForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => createSupplyReqMut.mutate()} disabled={createSupplyReqMut.isPending || !supplyReqForm.insumo}
                        className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-black hover:bg-amber-600 disabled:opacity-50">
                        {createSupplyReqMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Criar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PRODUTOS ── */}
        {activeTab === 'produtos' && kitchenMode === 'admin' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-2xl font-display font-black text-gray-900">Cardápio / Produtos</h2>
              <button onClick={() => setProductForm({ name: '', price: '0', emoji: '', categoria: 'lanche', sazonal: false, disponivel: true, imageUrl: null, quantidadeInicial: '0' })}
                className="bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> Novo Produto
              </button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Emoji', 'Nome', 'Categoria', 'Preço', 'Estoque', 'Status', 'Ações'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map((p: ApiProduct) => {
                    const s = stock.find((x: ApiStockItem) => x.productId === p.id);
                    return (
                      <tr key={p.id} className={!p.disponivel ? 'opacity-60 bg-gray-50' : ''}>
                        <td className="px-4 py-3 text-2xl">{p.emoji}</td>
                        <td className="px-4 py-3 font-bold text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-500 capitalize">{CATEGORY_LABELS[p.categoria] ?? p.categoria}</td>
                        <td className="px-4 py-3 font-black text-primary">{formatCurrency(Number(p.price))}</td>
                        <td className="px-4 py-3 font-bold text-gray-700">{s?.quantidade ?? 0}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleProductMut.mutate({ id: p.id, disponivel: !p.disponivel })}
                            className={`flex items-center gap-1 text-xs font-black px-2 py-1 rounded-full border transition-colors ${p.disponivel ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'}`}>
                            {p.disponivel ? <><ToggleRight className="w-3 h-3" /> Ativo</> : <><ToggleLeft className="w-3 h-3" /> Inativo</>}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => setProductForm({ id: p.id, name: p.name, price: p.price, emoji: p.emoji, categoria: p.categoria, sazonal: p.sazonal, disponivel: p.disponivel, imageUrl: p.imageUrl })}
                              className="p-1.5 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => { if (confirm(`Remover "${p.name}"?`)) removeProductMut.mutate(p.id); }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Product form modal */}
            {productForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-black mb-5">{productForm.id ? 'Editar Produto' : 'Novo Produto'}</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Nome</label>
                        <input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Emoji {productForm.imageUrl && <span className="normal-case font-semibold text-gray-300">(opcional com foto)</span>}</label>
                        <input value={productForm.emoji} onChange={(e) => setProductForm({ ...productForm, emoji: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold text-center text-2xl focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Foto do produto</label>
                      <div className="flex items-center gap-3">
                        {productForm.imageUrl && (
                          <img src={productForm.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-gray-200" />
                        )}
                        <label className="flex-1 cursor-pointer border-2 border-dashed border-gray-300 rounded-xl px-3 py-3 text-center font-bold text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors">
                          {uploadingImage ? (
                            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</span>
                          ) : (
                            productForm.imageUrl ? 'Trocar foto' : 'Escolher foto'
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingImage}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              setUploadingImage(true);
                              try {
                                const webpFile = await convertImageToWebp(file);
                                const tempId = productForm.id ?? `novo-${uid()}`;
                                const url = await api.products.uploadImage(tempId, webpFile);
                                setProductForm((prev) => (prev ? { ...prev, imageUrl: url } : prev));
                                toast.success('Foto enviada!');
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Erro ao enviar a foto.');
                              } finally {
                                setUploadingImage(false);
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Preço (R$)</label>
                        <input type="number" step="0.01" min="0" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Categoria</label>
                        <select value={productForm.categoria} onChange={(e) => setProductForm({ ...productForm, categoria: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    {!productForm.id && (
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Estoque inicial</label>
                        <input type="number" step="1" min="0" value={productForm.quantidadeInicial ?? '0'}
                          onChange={(e) => setProductForm({ ...productForm, quantidadeInicial: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                      </div>
                    )}
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={productForm.sazonal} onChange={(e) => setProductForm({ ...productForm, sazonal: e.target.checked })} className="w-4 h-4" />
                        <span className="font-bold text-sm text-gray-700">Sazonal</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={productForm.disponivel} onChange={(e) => setProductForm({ ...productForm, disponivel: e.target.checked })} className="w-4 h-4" />
                        <span className="font-bold text-sm text-gray-700">Disponível</span>
                      </label>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setProductForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => createProductMut.mutate()} disabled={createProductMut.isPending || !productForm.name}
                        className="flex-1 py-3 bg-primary text-white rounded-xl font-black hover:bg-orange-600 disabled:opacity-50">
                        {createProductMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PROMOÇÕES ── */}
        {activeTab === 'promocoes' && kitchenMode === 'admin' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-2xl font-display font-black text-gray-900">Promoções</h2>
              <button onClick={() => setPromoForm({ nome: '', tipo: 'percentual', valor: '10', productIds: [], ativo: true })}
                className="bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> Nova Promoção
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {promotions.length === 0 && <p className="col-span-full text-center text-gray-400 py-12 bg-white rounded-2xl shadow-sm font-medium">Nenhuma promoção cadastrada.</p>}
              {promotions.map((promo: ApiPromotion) => (
                <div key={promo.id} className={`bg-white rounded-2xl shadow-sm p-5 border-l-4 ${promo.ativo ? 'border-l-emerald-400' : 'border-l-gray-300'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-black text-gray-900">{promo.nome}</p>
                      <p className="text-sm text-gray-500 font-medium">{promo.tipo === 'percentual' ? `${promo.valor}% de desconto` : `R$ ${promo.valor} de desconto`}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => removePromoMut.mutate(promo.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      <button onClick={() => setPromoForm({ id: promo.id, nome: promo.nome, tipo: promo.tipo, valor: promo.valor, productIds: promo.productIds, ativo: promo.ativo })}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {promo.productIds.map((pid) => {
                      const p = products.find((x: ApiProduct) => x.id === pid);
                      return p ? <span key={pid} className="bg-orange-100 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{p.name}</span> : null;
                    })}
                  </div>
                  <button onClick={() => api.promotions.update(promo.id, { ativo: !promo.ativo }).then(() => qc.invalidateQueries({ queryKey: ['promotions'] }))}
                    className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-colors ${promo.ativo ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'}`}>
                    {promo.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              ))}
            </div>

            {/* Promo form modal */}
            {promoForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-black mb-5">{promoForm.id ? 'Editar Promoção' : 'Nova Promoção'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Nome</label>
                      <input value={promoForm.nome} onChange={(e) => setPromoForm({ ...promoForm, nome: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Tipo</label>
                        <select value={promoForm.tipo} onChange={(e) => setPromoForm({ ...promoForm, tipo: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                          <option value="percentual">Percentual (%)</option>
                          <option value="fixo">Valor fixo (R$)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Valor</label>
                        <input type="number" step="0.01" min="0" value={promoForm.valor} onChange={(e) => setPromoForm({ ...promoForm, valor: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-2">Produtos</label>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                        {products.map((p: ApiProduct) => (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-xl">
                            <input type="checkbox" checked={promoForm.productIds.includes(p.id)}
                              onChange={(e) => setPromoForm({ ...promoForm, productIds: e.target.checked ? [...promoForm.productIds, p.id] : promoForm.productIds.filter((x) => x !== p.id) })}
                              className="w-4 h-4" />
                            <span className="text-sm font-bold text-gray-700">{p.emoji} {p.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setPromoForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => savePromoMut.mutate()} disabled={savePromoMut.isPending || !promoForm.nome}
                        className="flex-1 py-3 bg-primary text-white rounded-xl font-black hover:bg-orange-600 disabled:opacity-50">
                        {savePromoMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FUNCIONÁRIOS ── */}
        {activeTab === 'funcionarios' && kitchenMode === 'admin' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-2xl font-display font-black text-gray-900">Funcionários</h2>
              <button onClick={() => setEmpForm({ nome: '', username: '', password: '', role: 'funcionario', horario: '', ativo: true })}
                className="bg-primary text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> Novo Funcionário
              </button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Nome', 'Usuário', 'Cargo', 'Horário', 'Status', 'Ações'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {employees.map((e: ApiEmployee) => (
                    <tr key={e.id} className={!e.ativo ? 'opacity-50' : ''}>
                      <td className="px-4 py-3 font-bold text-gray-900">{e.nome}</td>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-gray-600">{e.username}</td>
                      <td className="px-4 py-3"><span className={`text-xs font-black px-2 py-1 rounded-full ${e.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600'}`}>{e.role}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-medium">{e.horario || '—'}</td>
                      <td className="px-4 py-3"><span className={`text-xs font-black px-2 py-1 rounded-full ${e.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{e.ativo ? 'Ativo' : 'Inativo'}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setEmpForm({ id: e.id, nome: e.nome, username: e.username, password: '', role: e.role, horario: e.horario, ativo: e.ativo })}
                            className="p-1.5 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                          {e.id !== loggedEmployee.id && (
                            <button onClick={() => { if (confirm(`Remover "${e.nome}"?`)) removeEmpMut.mutate(e.id); }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Employee form modal */}
            {empForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-black mb-5">{(empForm as any).id ? 'Editar Funcionário' : 'Novo Funcionário'}</h3>
                  <div className="space-y-4">
                    {[
                      { field: 'nome', label: 'Nome completo' },
                      { field: 'username', label: 'Usuário (login)' },
                      { field: 'password', label: 'Senha' },
                      { field: 'horario', label: 'Horário (ex: Seg-Sex 07h-13h)' },
                    ].map(({ field, label }) => (
                      <div key={field}>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
                        <input type={field === 'password' ? 'password' : 'text'} value={(empForm as any)[field]} placeholder={field === 'password' && empForm.id ? 'Deixe em branco para manter' : undefined} autoComplete={field === 'password' ? 'new-password' : undefined} onChange={(e) => setEmpForm({ ...empForm!, [field]: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Cargo</label>
                        <select value={empForm.role} onChange={(e) => setEmpForm({ ...empForm!, role: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none">
                          <option value="funcionario">Funcionário</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer pb-3">
                          <input type="checkbox" checked={empForm.ativo} onChange={(e) => setEmpForm({ ...empForm!, ativo: e.target.checked })} className="w-4 h-4" />
                          <span className="font-bold text-sm text-gray-700">Ativo</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setEmpForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => saveEmpMut.mutate()} disabled={saveEmpMut.isPending || !empForm.nome || !empForm.username || (!empForm.id && !empForm.password)}
                        className="flex-1 py-3 bg-primary text-white rounded-xl font-black hover:bg-orange-600 disabled:opacity-50">
                        {saveEmpMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONFIGURAÇÕES ── */}
        {activeTab === 'configuracoes' && kitchenMode === 'admin' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-display font-black text-gray-900">Configurações</h2>
            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
              <h3 className="font-black text-gray-700">Dados da Loja</h3>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Nome da Loja</label>
                <input
                  defaultValue={settings?.nomeLoja}
                  onBlur={(e) => setSettingsForm((f) => ({ ...(f ?? { nomeLoja: settings?.nomeLoja ?? '', whatsappNumero: settings?.whatsappNumero ?? '' }), nomeLoja: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">WhatsApp (com DDI, só dígitos)</label>
                <input
                  defaultValue={settings?.whatsappNumero}
                  onBlur={(e) => setSettingsForm((f) => ({ ...(f ?? { nomeLoja: settings?.nomeLoja ?? '', whatsappNumero: settings?.whatsappNumero ?? '' }), whatsappNumero: e.target.value }))}
                  placeholder="5511999999999"
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-bold focus:border-primary focus:outline-none" />
              </div>
              {settingsForm && (
                <button onClick={() => saveSettingsMut.mutate()} disabled={saveSettingsMut.isPending}
                  className="w-full bg-primary text-white py-4 rounded-2xl font-black text-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {saveSettingsMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Salvar Configurações
                </button>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
              <h3 className="font-black text-gray-700">Manutenção</h3>
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5">
                <p className="font-black text-red-700 mb-1">Limpar Histórico de Vendas</p>
                <p className="text-red-600 text-sm font-medium mb-4">Remove permanentemente todos os pedidos, transações e registros de desperdício. Estoque, clientes, funcionários e configurações não são afetados.</p>
                <button onClick={() => { if (confirm('ATENÇÃO: Esta ação não pode ser desfeita. Continuar?')) clearSalesMut.mutate(); }}
                  disabled={clearSalesMut.isPending}
                  className="bg-red-600 text-white px-6 py-3 rounded-xl font-black hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {clearSalesMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Limpar Histórico
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
