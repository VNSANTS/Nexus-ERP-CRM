import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatCurrency,
  computeLoyaltyStatus,
  getEffectivePrice,
  CATEGORY_LABELS,
  PAYMENT_LABELS,
  type ApiOrder,
  type ApiProduct,
} from '../lib/api';
import { cartStore, useCart } from '../lib/cart-store';
import { QRCodeSVG } from 'qrcode.react';
import {
  Trash2, Plus, Minus, CreditCard, Wallet, Banknote, QrCode,
  ArrowLeft, CheckCircle2, ShoppingCart, X, MessageCircle,
  Sparkles, Heart, XCircle, Loader2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const REFERENCE_ASSET = `${import.meta.env.BASE_URL}reference/`;

const CATEGORY_TABS: Array<{ key: 'todos' | 'lanche' | 'bebida' | 'combo' | 'sazonal'; label: string; icon: string }> = [
  { key: 'todos', label: 'Todos', icon: 'icon-all.webp' },
  { key: 'lanche', label: CATEGORY_LABELS.lanche, icon: 'icon-lanche.webp' },
  { key: 'bebida', label: CATEGORY_LABELS.bebida, icon: 'icon-bebida.webp' },
  { key: 'combo', label: CATEGORY_LABELS.combo, icon: 'icon-combo.webp' },
  { key: 'sazonal', label: 'Sazonais', icon: 'icon-sazonal.webp' },
];

const ADMIN_HOLD_MS = 5000;

function referenceFoodImage(product: ApiProduct) {
  const name = product.name.toLocaleLowerCase('pt-BR');
  if (name.includes('combo')) return 'food-combo.webp';
  if (name.includes('coxinha')) return 'food-coxinha.webp';
  if (name.includes('pastel')) return 'food-pastel.webp';
  if (name.includes('refrigerante') || name.includes('refri')) return 'food-refrigerante.webp';
  if (name.includes('uva')) return 'food-uva.webp';
  if (name.includes('canjica')) return 'food-canjica.webp';
  if (name.includes('suco')) return 'food-suco.webp';
  return null;
}

export function Home() {
  const qc = useQueryClient();
  const [view, setView] = useState<'menu' | 'payment' | 'success'>('menu');
  const [createdOrder, setCreatedOrder] = useState<ApiOrder | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cartOpen, setCartOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'todos' | 'lanche' | 'bebida' | 'combo' | 'sazonal'>('todos');
  const [observacoes, setObservacoes] = useState('');
  const [telefone, setTelefone] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);

  const cart = useCart();

  // Queries
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: api.products.list,
    refetchInterval: 30_000,
  });
  const { data: stock = [] } = useQuery({
    queryKey: ['stock'],
    queryFn: api.stock.list,
    refetchInterval: 15_000,
  });
  const { data: promotions = [] } = useQuery({
    queryKey: ['promotions-active'],
    queryFn: api.promotions.listActive,
    refetchInterval: 30_000,
  });
  const telefoneTrim = telefone.trim();
  const { data: loyaltyRecord = null } = useQuery({
    queryKey: ['loyalty', telefoneTrim],
    queryFn: () => api.customers.loyaltyByPhone(telefoneTrim),
    enabled: telefoneTrim.length > 0,
    refetchInterval: 60_000,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
    staleTime: 60_000,
  });

  const checkoutMutation = useMutation({
    mutationFn: (paymentMethod: string) =>
      api.orders.checkout({
        cartItems: cart.map((i) => ({ productId: i.productId, qty: i.qty })),
        paymentMethod,
        observacoes,
        telefone,
      }),
    onSuccess: (order) => {
      cartStore.clear();
      setCreatedOrder(order);
      setView('success');
      setCartOpen(false);
      setObservacoes('');
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['loyalty'] });
    },
    onError: () => toast.error('Erro ao finalizar pedido. Tente novamente.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.orders.updateStatus(id, 'cancelado'),
    onSuccess: () => {
      toast.success('Pedido cancelado.');
      setCreatedOrder(null);
      setTelefone('');
      setView('menu');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const cancelHold = () => {
    if (holdTimeoutRef.current) { window.clearTimeout(holdTimeoutRef.current); holdTimeoutRef.current = null; }
    if (holdIntervalRef.current) { window.clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
    setHoldProgress(0);
  };

  const startHold = () => {
    cancelHold();
    const start = Date.now();
    holdIntervalRef.current = window.setInterval(() => {
      setHoldProgress(Math.min(1, (Date.now() - start) / ADMIN_HOLD_MS));
    }, 40);
    holdTimeoutRef.current = window.setTimeout(() => {
      cancelHold();
      setLocation('/cozinha');
    }, ADMIN_HOLD_MS);
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const totalCart = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const visibleProducts = useMemo(() => {
    return products.filter((p: ApiProduct) => {
      if (!p.disponivel) return false;
      if (categoryFilter === 'todos') return true;
      if (categoryFilter === 'sazonal') return p.sazonal;
      return p.categoria === categoryFilter;
    });
  }, [products, categoryFilter]);

  const loyaltyStatus = telefoneTrim ? computeLoyaltyStatus(telefoneTrim, loyaltyRecord ? [loyaltyRecord] : []) : null;

  const getStock = (productId: string) => stock.find((s) => s.productId === productId)?.quantidade ?? 0;

  const whatsappUrl = `https://wa.me/${settings?.whatsappNumero ?? '5511999999999'}`;

  return (
    <div className="nexus-noise min-h-[100dvh] flex flex-col overflow-hidden relative bg-background">
      {/* HEADER */}
      <header className="px-3 sm:px-8 lg:px-12 pt-3 sm:pt-7 pb-3 flex justify-between items-start z-10 shrink-0 gap-2 sm:gap-3 max-w-[1500px] w-full mx-auto">
        <div className="flex items-start gap-2 sm:gap-8 min-w-0">
          <button
            type="button"
            aria-label="Segure por 5 segundos para acessar a área restrita"
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onContextMenu={(e) => e.preventDefault()}
            className="relative w-[6rem] sm:w-[10.5rem] h-[6rem] sm:h-[9.5rem] flex items-center justify-center shrink-0 select-none touch-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {holdProgress > 0 && (
              <svg className="absolute -inset-1.5 -rotate-90 pointer-events-none" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="3"
                  strokeDasharray={`${holdProgress * 100.53} 100.53`} strokeLinecap="round" />
              </svg>
            )}
            <img src={`${REFERENCE_ASSET}logo.webp`} alt="StarNexus" className="w-full h-full object-contain" />
          </button>
          <img
            src={`${REFERENCE_ASSET}greeting.webp`}
            alt="Olá! O que você vai pedir hoje?"
            className="w-[9rem] sm:w-[20rem] h-[6rem] sm:h-[9.5rem] object-contain object-left"
          />
        </div>

        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
           <div className="hidden md:flex text-xl sm:text-2xl font-black text-foreground bg-card px-5 sm:px-6 py-2 sm:py-3 rounded-2xl border border-border whitespace-nowrap shadow-sm">
            {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <AnimatePresence>
            {view === 'menu' && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex gap-2 sm:gap-4">
                 <button onClick={() => setWhatsappOpen(true)}
                    className="w-11 h-11 sm:w-20 sm:h-20 bg-card text-emerald-600 rounded-2xl flex items-center justify-center border border-border shadow-sm hover:-translate-y-1 shrink-0">
                  <MessageCircle className="w-5 h-5 sm:w-9 sm:h-9" strokeWidth={2.5} />
                </button>
                <button onClick={() => setCartOpen(true)}
                   className="relative w-11 h-11 sm:w-20 sm:h-20 bg-primary text-white rounded-2xl flex items-center justify-center shadow-[0_10px_24px_hsl(24_100%_50%/.22)] hover:-translate-y-1 shrink-0">
                  <ShoppingCart className="w-5 h-5 sm:w-9 sm:h-9" strokeWidth={2.5} />
                  {cartCount > 0 && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 bg-success text-white text-xs sm:text-base font-black w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 border-white shadow-md">
                      {cartCount}
                    </motion.span>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* TABS */}
      <AnimatePresence>
        {view === 'menu' && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
             className="px-4 sm:px-8 lg:px-12 pb-5 flex gap-3 sm:gap-4 overflow-x-auto shrink-0 hide-scrollbar max-w-[1500px] w-full mx-auto">
            {CATEGORY_TABS.map((tab) => {
              const isActive = categoryFilter === tab.key;
              return (
                 <button key={tab.key} onClick={() => setCategoryFilter(tab.key)}
                    className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-bold text-sm sm:text-base transition-all duration-300 border ${isActive ? 'bg-primary text-white border-primary shadow-md scale-105' : 'bg-card text-foreground border-border hover:border-primary/40'}`}>
                   <img src={`${REFERENCE_ASSET}${tab.icon}`} alt="" aria-hidden="true" className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full" />
                   {tab.label}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT */}
       <main className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 pb-24 relative z-0 hide-scrollbar max-w-[1500px] w-full mx-auto">
        {view === 'menu' && (
           <>
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5 sm:mb-7 flex items-end justify-between gap-4">
             <div>
               <p className="text-primary text-xs sm:text-sm font-black uppercase tracking-[.18em] mb-1">Cardápio de hoje</p>
               <h2 className="text-2xl sm:text-4xl font-display font-black text-foreground leading-tight">Escolha seus favoritos</h2>
             </div>
             <p className="hidden sm:block text-muted-foreground font-semibold text-sm max-w-[200px] text-right">Toque no item para adicionar ao seu pedido.</p>
           </motion.div>
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 pt-2">
            {loadingProducts ? (
              <div className="col-span-full flex items-center justify-center py-24">
                <Loader2 className="w-12 h-12 text-white animate-spin" />
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {visibleProducts.map((product: ApiProduct) => {
                  const available = getStock(product.id);
                  const isOutOfStock = available <= 0;
                  const disabled = isOutOfStock;
                  const { price, original, label } = getEffectivePrice(product, promotions);
                  const hasPromo = label !== null;

                  return (
                    <motion.button
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      whileHover={disabled ? {} : { y: -8, scale: 1.02 }}
                      whileTap={disabled ? {} : { scale: 0.95 }}
                      key={product.id}
                      disabled={disabled}
                      onClick={() => {
                        cartStore.add(product.id, product.name, price);
                         toast.success(`${product.name} adicionado!`, { duration: 1200 });
                      }}
                       className={`relative nexus-surface p-3 sm:p-4 rounded-[1.35rem] text-left flex flex-col h-full ${disabled ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:-translate-y-1 hover:shadow-lg'}`}>
                      {product.sazonal && (
                        <span className="absolute top-4 left-4 z-10 flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] sm:text-xs font-black px-3 py-1 rounded-full shadow-md">
                          <Sparkles className="w-3 h-3" /> SAZONAL
                        </span>
                      )}
                      {hasPromo && (
                        <span className="absolute top-4 right-4 z-10 bg-success text-white text-[10px] sm:text-xs font-black px-3 py-1 rounded-full shadow-md">{label}</span>
                      )}
                       <span
                         role="button"
                         tabIndex={0}
                         aria-label={favoriteIds.includes(product.id) ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}
                         onClick={(event) => { event.stopPropagation(); setFavoriteIds((ids) => ids.includes(product.id) ? ids.filter((id) => id !== product.id) : [...ids, product.id]); }}
                         onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setFavoriteIds((ids) => ids.includes(product.id) ? ids.filter((id) => id !== product.id) : [...ids, product.id]); } }}
                         className={`absolute right-3 top-3 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-card/90 border border-border ${favoriteIds.includes(product.id) ? 'text-primary' : 'text-muted-foreground'} hover:text-primary hover:border-primary`}
                       >
                         <Heart className={`w-4 h-4 ${favoriteIds.includes(product.id) ? 'fill-current' : ''}`} />
                       </span>
                        <div className="w-full aspect-[1.15] bg-[#fffaf3] rounded-xl flex items-center justify-center mb-3 shadow-inner overflow-hidden">
                         <motion.div whileHover={disabled ? {} : { rotate: 5, scale: 1.1 }} className="w-full h-full flex items-center justify-center">
                           {product.imageUrl ? (
                             <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                           ) : referenceFoodImage(product) ? (
                             <img src={`${REFERENCE_ASSET}${referenceFoodImage(product)}`} alt="" className="w-[76%] h-[76%] object-contain" />
                           ) : (
                             <span className="text-5xl sm:text-7xl" role="img" aria-label={product.name}>{product.emoji}</span>
                           )}
                         </motion.div>
                      </div>
                      <div className="flex-1 flex flex-col justify-end">
                         <h3 className="text-sm sm:text-lg font-display font-bold text-foreground mb-2 leading-tight">{product.name}</h3>
                        <div className="flex items-end gap-2 flex-wrap mt-auto">
                           <span className="text-base sm:text-xl font-black text-primary">{formatCurrency(price)}</span>
                           {hasPromo && <span className="text-[10px] sm:text-xs font-bold text-muted-foreground line-through mb-1">{formatCurrency(original)}</span>}
                           <span className="ml-auto w-8 h-8 sm:w-9 sm:h-9 rounded-lg border-2 border-primary/60 text-primary flex items-center justify-center"><Plus className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} /></span>
                        </div>
                      </div>
                      {disabled && (
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] rounded-[2rem] flex items-center justify-center z-20">
                          <div className="bg-gray-900 text-white font-black px-6 py-3 rounded-full text-sm sm:text-lg shadow-2xl -rotate-12 border-4 border-white/20">ESGOTADO</div>
                        </div>
                      )}
                    </motion.button>
                  );
                })}
                {!loadingProducts && visibleProducts.length === 0 && (
                  <div className="col-span-full text-center text-white/90 text-lg sm:text-2xl font-bold py-24 bg-black/10 rounded-[2rem] backdrop-blur-sm border-2 border-white/20">
                     <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-card/70 border border-border flex items-center justify-center"><Search className="w-7 h-7 text-muted-foreground" /></div>
                    Nenhum produto nesta categoria.
                  </div>
                )}
               </AnimatePresence>
             )}
           </motion.div>
           <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18 }} className="mt-5 sm:mt-7 rounded-[1.5rem] bg-[#FFF0DC] border border-[#F8D8B1] overflow-hidden relative">
             <button onClick={() => setCategoryFilter('combo')} className="absolute inset-0 z-10 cursor-pointer" aria-label="Ver combos" />
             <img src={`${REFERENCE_ASSET}combo-banner.webp`} alt="Combos que cabem no seu fome. Mais sabor por um preço especial." className="w-full h-auto object-cover" />
           </motion.section>
           </>
        )}

        {view === 'payment' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
             className="max-w-5xl mx-auto h-full flex flex-col justify-center items-center pt-8 sm:pt-12 text-foreground">
            <button onClick={() => setView('menu')}
              className="absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2 text-foreground hover:bg-[#FFF0DC] font-bold text-sm sm:text-xl px-4 sm:px-6 py-3 sm:py-4 rounded-2xl transition-colors bg-card border border-border shadow-sm">
              <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" /> Voltar ao Cardápio
            </button>

            <h2 className="text-3xl sm:text-6xl font-display font-extrabold text-foreground mb-4 text-center px-4">Como você quer pagar?</h2>
            <div className="bg-white text-primary text-2xl sm:text-4xl font-black px-8 py-4 rounded-full shadow-2xl mb-8 sm:mb-12 border-4 border-orange-300/30">
              Total: {formatCurrency(totalCart)}
            </div>

            {loyaltyStatus && (
              <div className="bg-[#FFF0DC] border border-[#F8D8B1] text-foreground rounded-2xl px-6 sm:px-8 py-4 mb-8 sm:mb-12 flex items-center gap-3 sm:gap-4 text-base sm:text-xl font-bold max-w-2xl text-center shadow-sm">
                <Heart className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0 fill-primary" />
                {loyaltyStatus.ganhouBrinde
                 ? 'Parabéns! Você ganhou um brinde de fidelidade neste pedido!'
                  : `Faltam ${loyaltyStatus.restantes} pedido(s) para ganhar um brinde de fidelidade.`}
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full px-4 sm:px-0">
              {[
                { id: 'pix', label: PAYMENT_LABELS.pix, sub: 'QR Code', icon: QrCode, color: 'text-teal-600', bg: 'bg-teal-50', hover: 'hover:border-teal-500' },
                { id: 'credito', label: 'Crédito', sub: 'Na maquininha', icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50', hover: 'hover:border-blue-500' },
                { id: 'debito', label: 'Débito', sub: 'Na maquininha', icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-50', hover: 'hover:border-indigo-500' },
                { id: 'dinheiro', label: PAYMENT_LABELS.dinheiro, sub: 'No balcão', icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50', hover: 'hover:border-emerald-500' },
              ].map((method) => {
                const Icon = method.icon;
                return (
                  <motion.button whileHover={{ y: -8, scale: 1.02 }} whileTap={{ scale: 0.95 }} key={method.id}
                    disabled={checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate(method.id)}
                    className={`bg-white p-6 sm:p-10 rounded-[2rem] shadow-2xl border-4 border-transparent ${method.hover} transition-colors flex flex-col items-center justify-center gap-4 group disabled:opacity-60`}>
                    <div className={`w-16 h-16 sm:w-24 sm:h-24 ${method.bg} ${method.color} rounded-full flex items-center justify-center transition-transform group-hover:scale-110`}>
                      {checkoutMutation.isPending ? <Loader2 className="w-8 h-8 animate-spin" /> : <Icon className="w-8 h-8 sm:w-12 sm:h-12" strokeWidth={2.5} />}
                    </div>
                    <div className="text-center">
                      <span className="block text-lg sm:text-2xl font-display font-bold text-gray-900 mb-1">{method.label}</span>
                      <span className="block text-xs sm:text-sm font-bold text-gray-400 uppercase tracking-wider">{method.sub}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {view === 'success' && createdOrder && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
             className="max-w-4xl mx-auto h-full flex flex-col justify-center items-center text-center py-8 sm:py-12 px-4 text-foreground">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5, delay: 0.2 }}
              className="w-24 h-24 sm:w-32 sm:h-32 bg-success text-white rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(22,163,74,0.5)] mb-6 sm:mb-8">
              <CheckCircle2 className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={3} />
            </motion.div>
            <h2 className="text-3xl sm:text-6xl font-display font-extrabold text-foreground mb-4">Pedido Confirmado!</h2>
            <p className="text-lg sm:text-2xl text-muted-foreground font-bold mb-6 sm:mb-8">Seu número de chamada é:</p>
            <div className="text-6xl sm:text-9xl font-display font-black text-primary bg-white px-12 sm:px-24 py-8 sm:py-12 rounded-[3rem] shadow-2xl mb-6 sm:mb-8 border-4 border-white/50">
              {createdOrder.code}
            </div>
            <div className="bg-card border border-border text-foreground px-6 sm:px-8 py-3 sm:py-4 rounded-full mb-8 sm:mb-12 font-mono text-sm sm:text-xl font-bold tracking-widest text-center shadow-sm">
              CÓDIGO: {createdOrder.paymentCode}
            </div>

            {createdOrder.paymentMethod === 'pix' && (
              <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-2xl mb-8 flex flex-col sm:flex-row items-center gap-6 sm:gap-10 border-4 border-teal-100 max-w-2xl w-full">
                <div className="bg-gray-50 p-4 rounded-2xl">
                  <QRCodeSVG value={`PIX-DEMO-${createdOrder.paymentCode}`} size={160} level="Q" />
                </div>
                <div className="text-center sm:text-left">
                  <h3 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 mb-2">Pague com PIX</h3>
                  <p className="text-gray-500 font-medium text-sm sm:text-lg">Escaneie o QR Code com o aplicativo do seu banco para concluir o pagamento.</p>
                </div>
              </div>
            )}

            <div className="bg-card p-6 sm:p-8 rounded-[2rem] flex flex-col sm:flex-row items-center gap-6 sm:gap-8 mb-8 sm:mb-12 max-w-2xl w-full border border-border shadow-sm text-foreground">
              <div className="bg-white p-3 rounded-2xl shadow-lg">
                <QRCodeSVG value={`${window.location.origin}${import.meta.env.BASE_URL}acompanhar/${createdOrder.code}`} size={100} />
              </div>
              <div className="text-center sm:text-left">
                <p className="font-display font-bold text-xl sm:text-2xl mb-2">Acompanhe pelo celular</p>
                <p className="text-muted-foreground font-medium text-sm sm:text-base">Escaneie para saber quando seu pedido estiver pronto!</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
              <button onClick={() => { setCreatedOrder(null); setTelefone(''); setView('menu'); }}
                className="w-full sm:w-auto bg-gray-900 text-white px-10 sm:px-16 py-5 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-xl sm:text-2xl hover:bg-gray-800 transition-colors shadow-xl active:scale-95">
                Fazer Novo Pedido
              </button>
              {createdOrder.status === 'recebido' && (
                <button
                  onClick={() => {
                    if (!window.confirm('Cancelar este pedido?')) return;
                    cancelMutation.mutate(createdOrder.id);
                  }}
                  disabled={cancelMutation.isPending}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-red-100 font-bold text-lg sm:text-xl px-8 py-5 sm:py-6 rounded-2xl sm:rounded-3xl bg-red-600 hover:bg-red-700 transition-colors shadow-xl active:scale-95 disabled:opacity-60">
                  <XCircle className="w-5 h-5 sm:w-6 sm:h-6" /> Cancelar
                </button>
              )}
            </div>
          </motion.div>
        )}
      </main>

      {/* WHATSAPP MODAL */}
      <AnimatePresence>
        {whatsappOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setWhatsappOpen(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-[2rem] p-8 sm:p-10 max-w-sm w-full text-center shadow-2xl z-10">
              <button onClick={() => setWhatsappOpen(false)} className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <MessageCircle className="w-10 h-10" strokeWidth={2.5} />
              </div>
              <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-gray-900 mb-2">Fale conosco</h3>
              <p className="text-gray-500 mb-8 font-medium text-base">Escaneie para conversar com a cantina pelo WhatsApp.</p>
              <div className="flex justify-center bg-gray-50 p-6 rounded-3xl border-2 border-gray-100 shadow-inner">
                <QRCodeSVG value={whatsappUrl} size={180} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CART DRAWER */}
      <AnimatePresence>
        {cartOpen && (
          <div className="fixed inset-0 z-40 flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full sm:max-w-md md:max-w-lg h-full bg-white shadow-2xl flex flex-col z-10 sm:rounded-l-[2rem] overflow-hidden">
              <div className="p-6 sm:p-8 flex justify-between items-center bg-gray-50 border-b border-gray-100">
                <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-gray-900 flex items-center gap-3">
                  <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-primary" /> Seu Pedido
                </h2>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button onClick={() => cartStore.clear()}
                      className="text-gray-400 hover:text-red-500 font-bold px-3 sm:px-4 py-2 rounded-full hover:bg-red-50 transition-colors flex items-center gap-2 text-sm sm:text-base">
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" /><span className="hidden sm:inline">Limpar</span>
                    </button>
                  )}
                  <button onClick={() => setCartOpen(false)}
                    className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-full transition-colors bg-white shadow-sm">
                    <X className="w-6 h-6 sm:w-7 sm:h-7" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-white hide-scrollbar">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                     <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mb-6 shadow-inner"><ShoppingCart className="w-14 h-14 text-muted-foreground" /></div>
                    <h3 className="text-xl font-display font-bold text-gray-900 mb-2">Seu carrinho está vazio</h3>
                    <p className="text-base font-medium">Toque nos itens do cardápio para adicionar.</p>
                  </div>
                ) : (
                  <>
                    <AnimatePresence>
                      {cart.map((item) => (
                        <motion.div layout initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, x: 20 }}
                          key={item.productId} className="bg-gray-50 rounded-[1.5rem] p-4 flex gap-4 items-center border border-gray-100">
                          <div className="text-4xl bg-white w-20 h-20 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                            {products.find((p: ApiProduct) => p.id === item.productId)?.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 text-lg sm:text-xl truncate mb-1">{item.name}</h3>
                            <p className="text-primary font-black text-lg">{formatCurrency(item.price * item.qty)}</p>
                          </div>
                          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3 bg-white rounded-xl shadow-sm p-1.5 border border-gray-200">
                            <button onClick={() => cartStore.decrement(item.productId)}
                              className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-lg active:scale-95 transition-all">
                              <Minus className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={3} />
                            </button>
                            <span className="font-black text-lg sm:text-xl w-6 sm:w-8 text-center">{item.qty}</span>
                            <button onClick={() => {
                              const p = products.find((x: ApiProduct) => x.id === item.productId);
                              if (p) cartStore.add(p.id, p.name, getEffectivePrice(p, promotions).price);
                            }}
                              className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-primary hover:bg-orange-50 rounded-lg active:scale-95 transition-all">
                              <Plus className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={3} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <div className="pt-6 space-y-5">
                      <div>
                        <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Observações (opcional)</label>
                        <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                          placeholder="Ex: sem cebola, molho à parte..."
                          className="w-full border-2 border-gray-200 rounded-2xl p-4 text-base sm:text-lg resize-none h-20 sm:h-24 focus:border-primary focus:outline-none transition-colors font-medium" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
                          <Heart className="inline w-4 h-4 text-pink-500 mr-1" />Seu celular (fidelidade)
                        </label>
                        <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="w-full border-2 border-gray-200 rounded-2xl px-5 py-4 text-base sm:text-lg focus:border-primary focus:outline-none transition-colors font-medium" />
                        {loyaltyStatus && (
                          <p className={`mt-2 text-sm font-bold ${loyaltyStatus.ganhouBrinde ? 'text-emerald-600' : 'text-gray-500'}`}>
                           {loyaltyStatus.ganhouBrinde ? 'Você ganhou um brinde!' : `Faltam ${loyaltyStatus.restantes} pedido(s) para o brinde`}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 sm:p-8 bg-white border-t border-gray-100 space-y-4 shrink-0">
                  <div className="flex justify-between items-center">
                    <span className="text-xl sm:text-2xl font-bold text-gray-700">Total</span>
                    <span className="text-2xl sm:text-3xl font-black text-primary">{formatCurrency(totalCart)}</span>
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { setCartOpen(false); setView('payment'); }}
                    className="w-full bg-primary text-white py-5 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-xl sm:text-2xl shadow-xl hover:bg-orange-600 transition-colors active:scale-95">
                    Escolher Pagamento
                  </motion.button>
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
