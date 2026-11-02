import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatCurrency,
  computeLoyaltyStatus,
  getEffectivePrice,
  CATEGORY_LABELS,
  PAYMENT_LABELS,
  normalizePhoneIdentity,
  type ApiOrder,
  type ApiProduct,
} from '../lib/api';
import { cartStore, useCart } from '../lib/cart-store';
import { QRCodeSVG } from 'qrcode.react';
import {
  Trash2, Plus, Minus, CreditCard, Wallet, Banknote, QrCode,
  ArrowLeft, CheckCircle2, ShoppingCart, X, MessageCircle,
  Sparkles, Heart, XCircle, Loader2,
  Search, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomerAuth } from '../lib/customer-auth';

const REFERENCE_ASSET = `${import.meta.env.BASE_URL}reference/`;

const CATEGORY_TABS: Array<{ key: 'todos' | 'lanche' | 'bebida' | 'combo' | 'sazonal'; label: string; icon: string }> = [
  { key: 'todos', label: 'Todos', icon: 'icon-all.webp' },
  { key: 'lanche', label: CATEGORY_LABELS.lanche, icon: 'icon-lanche.webp' },
  { key: 'bebida', label: CATEGORY_LABELS.bebida, icon: 'icon-bebida.webp' },
  { key: 'combo', label: CATEGORY_LABELS.combo, icon: 'icon-combo.webp' },
  { key: 'sazonal', label: 'Sazonais', icon: 'icon-sazonal.webp' },
];

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

function hexToHsl(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return '24 100% 50%';
  const value = match[1];
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

export function Home() {
  const qc = useQueryClient();
  const { profile } = useCustomerAuth();
  const establishmentId = sessionStorage.getItem('nexus:establishmentId') ?? sessionStorage.getItem('nexus:deviceEstablishmentId');
  const establishmentMenuUrl = establishmentId
    ? `${window.location.origin}${import.meta.env.BASE_URL}e/${encodeURIComponent(establishmentId)}`
    : null;
  const [view, setView] = useState<'menu' | 'payment' | 'success'>('menu');
  const [createdOrder, setCreatedOrder] = useState<ApiOrder | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cartOpen, setCartOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [menuQrOpen, setMenuQrOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'todos' | 'lanche' | 'bebida' | 'combo' | 'sazonal'>('todos');
  const [observacoes, setObservacoes] = useState('');
  const [telefone, setTelefone] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const checkoutAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const cart = useCart();

  // Queries
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products', establishmentId],
    queryFn: api.products.list,
    refetchInterval: 30_000,
  });
  const { data: stock = [] } = useQuery({
    queryKey: ['menu-stock', establishmentId],
    queryFn: api.stock.listForMenu,
    refetchInterval: 15_000,
  });
  const { data: promotions = [] } = useQuery({
    queryKey: ['promotions-active', establishmentId],
    queryFn: api.promotions.listActive,
    refetchInterval: 30_000,
  });
  const telefoneTrim = telefone.trim();
  const isAccountPhone = Boolean(profile?.telefone && telefoneTrim &&
    normalizePhoneIdentity(profile.telefone) === normalizePhoneIdentity(telefoneTrim));
  const { data: loyaltyRecord = null } = useQuery({
    queryKey: ['loyalty', profile?.id, establishmentId],
    queryFn: api.customers.myLoyalty,
    enabled: isAccountPhone,
    refetchInterval: 60_000,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings', establishmentId],
    queryFn: api.settings.get,
    staleTime: 60_000,
  });

  const checkoutMutation = useMutation({
    mutationFn: (paymentMethod: string) => {
      const cartItems = cart.map((i) => ({ productId: i.productId, qty: i.qty }));
      const fingerprint = JSON.stringify({ establishmentId, cartItems, paymentMethod, observacoes, telefone });
      if (checkoutAttemptRef.current?.fingerprint !== fingerprint) {
        checkoutAttemptRef.current = { fingerprint, key: crypto.randomUUID() };
      }
      return api.orders.checkout({
        establishmentId: establishmentId ?? undefined,
        cartItems,
        paymentMethod,
        observacoes,
        telefone,
        idempotencyKey: checkoutAttemptRef.current.key,
      });
    },
    onSuccess: (order) => {
      checkoutAttemptRef.current = null;
      cartStore.clear();
      setCreatedOrder(order);
      setView('success');
      setCartOpen(false);
      setObservacoes('');
      qc.invalidateQueries({ queryKey: ['menu-stock'] });
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

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (profile?.telefone && !telefone) setTelefone(profile.telefone);
  }, [profile?.telefone, telefone]);

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

  const featuredCombo = products.find((p: ApiProduct) => p.categoria === 'combo' && p.disponivel);

  const loyaltyStatus = isAccountPhone && loyaltyRecord
    ? computeLoyaltyStatus(telefoneTrim, [loyaltyRecord])
    : null;

  const getStock = (productId: string) => stock.find((s) => s.productId === productId)?.quantidade ?? 0;

  const whatsappUrl = `https://wa.me/${settings?.whatsappNumero ?? '5511999999999'}`;
  const isStarNexus = /star\s*nexus/i.test(settings?.nomeLoja ?? '');
  const menuPrimary = settings?.menuPrimaryColor ?? '#ff6600';
  const menuBackground = isStarNexus ? '#10141a' : (settings?.menuBackgroundColor ?? '#f7f3ed');
  const menuTheme = {
    '--primary': hexToHsl(menuPrimary),
    '--ring': hexToHsl(menuPrimary),
    '--background': hexToHsl(menuBackground),
    ...(isStarNexus ? {
      '--foreground': '0 0% 96%',
      '--card': '220 18% 11%',
      '--card-foreground': '0 0% 96%',
      '--popover': '220 18% 11%',
      '--popover-foreground': '0 0% 96%',
      '--border': '220 12% 22%',
      '--input': '220 12% 22%',
      '--muted': '220 14% 16%',
      '--muted-foreground': '220 9% 68%',
      '--secondary': '220 14% 16%',
      '--secondary-foreground': '0 0% 96%',
      '--accent': '24 80% 16%',
      '--accent-foreground': '24 100% 80%',
    } : {}),
  } as CSSProperties;

  return (
    <div style={menuTheme} className="nexus-noise min-h-[100dvh] flex flex-col overflow-hidden relative bg-background">{isStarNexus && <style>{'@keyframes starnexus-marquee{to{transform:translateX(-50%)}}.starnexus-grid{background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:54px 54px;mask-image:linear-gradient(to right,black,transparent 90%)}.starnexus-outline{color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.55)}.starnexus-orbit{transform:rotate(-28deg);box-shadow:0 0 80px rgba(255,106,0,.06),inset 0 0 80px rgba(255,106,0,.04)}.starnexus-orbit-one{animation:starnexus-spin 55s linear infinite}.starnexus-orbit-two{animation:starnexus-spin 75s linear infinite reverse}@keyframes starnexus-spin{to{transform:rotate(332deg)}}@media(prefers-reduced-motion:reduce){.starnexus-orbit-one,.starnexus-orbit-two,.starnexus-marquee>div{animation:none!important}}'}</style>}
      {/* HEADER — marca e ações rápidas */}
      <header className="relative z-30 mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 border-b border-white/5 px-4 pb-4 pt-4 sm:px-8 sm:pt-6 lg:px-12">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-sm ring-1 ring-white/10 sm:h-16 sm:w-16 ${isStarNexus ? 'bg-[#1b2028]' : 'bg-white ring-black/5'}`}>
            <img src={settings?.logoUrl || `${REFERENCE_ASSET}logo.webp`} alt={settings?.nomeLoja || 'Logo do estabelecimento'} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-black tracking-tight text-foreground sm:text-xl">{settings?.nomeLoja || 'StarNexus'}</p>
            <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-primary sm:text-xs">Seu momento. Seu sabor.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden rounded-full border border-border bg-card/80 px-4 py-2 text-sm font-black text-foreground sm:block">
            {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <AnimatePresence>
            {view === 'menu' && (
              <motion.div initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }} className="flex gap-2">
                <button onClick={() => setWhatsappOpen(true)} aria-label="Falar com a cantina" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-emerald-600 shadow-sm sm:h-12 sm:w-12">
                  <MessageCircle className="h-5 w-5" />
                </button>
                <button onClick={() => setCartOpen(true)} aria-label="Abrir carrinho" className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-orange-900/20 sm:h-12 sm:w-12">
                  <ShoppingCart className="h-5 w-5" />
                  {cartCount > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-foreground px-1 text-[10px] font-black text-white">{cartCount}</motion.span>}
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
             className="sticky top-0 z-20 mx-auto flex w-full max-w-[1500px] shrink-0 gap-2 overflow-x-auto border-b border-border/60 bg-background/90 px-4 pb-4 pt-3 backdrop-blur-2xl hide-scrollbar sm:gap-3 sm:px-8 lg:px-12">
            {CATEGORY_TABS.map((tab) => {
              const isActive = categoryFilter === tab.key;
              return (
                 <button key={tab.key} onClick={() => setCategoryFilter(tab.key)}
                    className={`group shrink-0 whitespace-nowrap flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-extrabold transition-all duration-300 sm:px-5 sm:text-sm ${isActive ? 'bg-foreground text-white shadow-lg shadow-slate-900/15' : 'border border-border bg-card/80 text-foreground hover:border-primary/50 hover:bg-white'}`}>
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
           <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="starnexus-hero relative isolate mb-10 mt-3 min-h-[540px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#101116] text-white shadow-[0_35px_100px_rgba(0,0,0,.45)] sm:min-h-[610px] lg:min-h-[660px]">
<div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50" style={{backgroundImage:"radial-gradient(ellipse at 76% 42%, rgba(255,104,0,.32), transparent 38%), radial-gradient(ellipse at 15% 100%, rgba(255,104,0,.12), transparent 38%)"}} />
<div aria-hidden="true" className="starnexus-grid pointer-events-none absolute inset-0 opacity-30" />
<div aria-hidden="true" className="starnexus-orbit starnexus-orbit-one absolute right-[-15%] top-[5%] h-[78%] aspect-square rounded-full border border-orange-400/20" />
<div aria-hidden="true" className="starnexus-orbit starnexus-orbit-two absolute right-[-7%] top-[12%] h-[64%] aspect-square rounded-full border border-white/10" />
{isStarNexus && <img src={`${REFERENCE_ASSET}food-combo.webp`} alt="" aria-hidden="true" className="pointer-events-none absolute -right-[16%] bottom-[-13%] z-[1] h-[92%] w-[90%] object-contain drop-shadow-[0_35px_45px_rgba(0,0,0,.65)] sm:-right-[7%] sm:bottom-[-16%] sm:h-[112%] sm:w-[78%] lg:right-[-2%] lg:h-[118%] lg:w-[68%]" /> }
<div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-r from-[#101116] via-[#101116]/90 to-transparent" />
<div className="relative z-10 flex min-h-[540px] flex-col justify-between p-6 sm:min-h-[610px] sm:p-10 lg:min-h-[660px] lg:p-14">
<div className="flex items-center justify-between gap-4"><p className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[.24em] text-orange-200 sm:text-xs"><Sparkles className="h-3.5 w-3.5" /> EXPERIÊNCIA FORA DO COMUM</p><span className="hidden font-mono text-[10px] uppercase tracking-[.25em] text-white/40 sm:block">Nº 001 / MENU DIGITAL</span></div>
<div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]"><div className="max-w-3xl"><p className="mb-4 font-mono text-[10px] uppercase tracking-[.32em] text-orange-300 sm:text-xs">// SUA FOME. NOSSA MISSÃO.</p><h2 className="max-w-3xl font-display text-[clamp(3.5rem,10vw,8.8rem)] font-black uppercase leading-[.78] tracking-[-.055em]">O sabor<br /><span className="starnexus-outline">em outra</span><br /><span className="text-orange-400">órbita.</span></h2><p className="mt-7 max-w-md text-sm leading-relaxed text-white/65 sm:text-base">Descubra combinações que surpreendem. Escolha seu favorito e deixe o resto com a gente.</p><div className="mt-8 flex flex-wrap items-center gap-3"><button type="button" onClick={() => document.getElementById('menu-products')?.scrollIntoView({behavior:'smooth',block:'start'})} className="group inline-flex items-center gap-3 rounded-full bg-[#ff6a00] px-7 py-4 text-xs font-black uppercase tracking-[.16em] text-white shadow-[0_12px_40px_rgba(255,106,0,.25)] transition-all hover:-translate-y-1 hover:bg-orange-500 sm:text-sm">Explorar cardápio <span className="text-lg transition-transform group-hover:translate-x-1">↗</span></button><span className="rounded-full border border-white/15 px-5 py-4 font-mono text-[10px] uppercase tracking-[.18em] text-white/55">Feito na hora · Feito pra você</span></div></div>
<div className="flex items-end justify-between gap-4 lg:flex-col lg:items-end"><div className="hidden text-right lg:block"><p className="font-display text-6xl font-black leading-none text-white/10">SN—01</p><p className="mt-2 font-mono text-[9px] uppercase tracking-[.25em] text-white/40">Sabor em movimento</p></div>{establishmentMenuUrl && <button type="button" onClick={() => setMenuQrOpen(true)} aria-label="Ampliar QR code do cardápio" className="rounded-2xl border border-white/15 bg-white p-3 text-[10px] font-bold text-slate-800 shadow-2xl transition-transform hover:-translate-y-1"><QRCodeSVG value={establishmentMenuUrl} size={68} level="H" /><span className="mt-1 block">COMPARTILHAR</span></button>}</div></div>
<div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 font-mono text-[9px] uppercase tracking-[.2em] text-white/40 sm:text-[10px]"><span>01 — Escolha seu sabor</span><span>02 — Monte seu pedido</span><span>03 — Aproveite o momento</span><span className="text-orange-300">SCROLL TO EXPLORE ↓</span></div>
</div></motion.section>
<div className="starnexus-marquee relative -mx-4 mb-12 overflow-hidden border-y border-orange-500/30 bg-[#ff6a00] py-4 text-[#17120e] sm:-mx-8 lg:-mx-12"><div className="flex w-max animate-[starnexus-marquee_28s_linear_infinite] gap-8 whitespace-nowrap font-display text-2xl font-black uppercase tracking-wide sm:text-3xl">{Array.from({length:2}).map((_,index)=><div key={index} aria-hidden={index===1} className="flex items-center gap-8">{['SMASH NA CHAPA','INGREDIENTES SELECIONADOS','COMBINAÇÕES INCRÍVEIS','SEU MOMENTO. SEU SABOR.'].map(item=><span key={item} className="flex items-center gap-8">{item}<span aria-hidden="true">✳</span></span>)}</div>)}</div></div>
<div className="mb-6 flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.28em] text-primary">// 01 — CARDÁPIO</p><h3 className="mt-2 font-display text-3xl font-black uppercase tracking-tight text-foreground sm:text-5xl">{categoryFilter === 'todos' ? 'Escolha sua trajetória' : CATEGORY_TABS.find((tab) => tab.key === categoryFilter)?.label}</h3></div><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{visibleProducts.length} {visibleProducts.length === 1 ? 'opção' : 'opções'}</span></div>

           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} id="menu-products" className="grid grid-cols-1 gap-5 pt-1 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
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
                       className={`group relative flex h-full flex-col overflow-hidden rounded-[1.6rem] border p-2.5 text-left transition-all duration-300 sm:rounded-[1.8rem] sm:p-4 ${isStarNexus ? 'border-white/[.09] bg-gradient-to-b from-[#202630] to-[#15191f] shadow-[0_20px_45px_rgba(0,0,0,.3)]' : 'border-black/[.045] bg-white shadow-[0_8px_24px_rgba(36,31,24,.055)]'} ${disabled ? 'cursor-not-allowed opacity-55 grayscale' : 'hover:-translate-y-2 hover:border-primary/40 hover:shadow-[0_25px_55px_rgba(0,0,0,.3)]'}`}>
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
                        <div className={`mb-4 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[1.2rem] sm:rounded-[1.4rem] ${isStarNexus ? 'bg-[#202630]' : 'bg-[#f5f0e8]'}`}>
                         <motion.div whileHover={disabled ? {} : { rotate: 5, scale: 1.1 }} className="w-full h-full flex items-center justify-center">
                           {product.imageUrl ? (
                             <img src={product.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                           ) : referenceFoodImage(product) ? (
                             <img src={`${REFERENCE_ASSET}${referenceFoodImage(product)}`} alt="" className="h-[82%] w-[82%] object-contain transition-transform duration-500 group-hover:scale-110" />
                           ) : (
                             <span className="text-5xl sm:text-7xl" role="img" aria-label={product.name}>{product.emoji}</span>
                           )}
                         </motion.div>
                      </div>
                      <div className="flex-1 flex flex-col justify-end">
                         <h3 className="mb-2 line-clamp-2 font-display text-base font-black uppercase leading-[.95] tracking-tight text-foreground sm:text-xl">{product.name}</h3>
                        <div className="flex items-end gap-2 flex-wrap mt-auto">
                           <span className="font-display text-xl font-black text-primary sm:text-2xl">{formatCurrency(price)}</span>
                           {hasPromo && <span className="text-[10px] sm:text-xs font-bold text-muted-foreground line-through mb-1">{formatCurrency(original)}</span>}
                           <span className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-orange-950/25 sm:h-9 sm:w-9"><Plus className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} /></span>
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
                  <div className={`col-span-full rounded-[1.8rem] border border-dashed border-border px-5 py-14 text-center ${isStarNexus ? 'bg-[#171c24]' : 'bg-white/70'}`}>
                     <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0df] text-primary"><Search className="h-6 w-6" /></div>
                     <p className="font-display text-lg font-black text-foreground">Essa prateleira está vazia</p>
                     <p className="mt-1 text-sm text-muted-foreground">Ainda não há itens disponíveis nesta categoria.</p>
                     <button type="button" onClick={() => setCategoryFilter('todos')} className="mt-5 rounded-full bg-foreground px-5 py-2.5 text-xs font-black text-white">Ver todo o cardápio</button>
                  </div>
                )}
               </AnimatePresence>
             )}
           </motion.div>
           {featuredCombo ? (
              <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18 }}
                className={`group relative mt-10 grid min-h-[360px] overflow-hidden rounded-[2rem] border ${isStarNexus ? 'border-white/10 bg-[#171c24]' : 'border-orange-100 bg-[#fff7ed]'} shadow-[0_28px_70px_rgba(0,0,0,.22)] md:mt-14 md:min-h-[470px] md:grid-cols-12`}>
                <div className="relative min-h-[250px] overflow-hidden md:col-span-7 md:min-h-[470px]">
                  <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_45%_48%,rgba(255,106,0,.24),transparent_58%)]" />
                  <div aria-hidden="true" className="absolute inset-[8%] rounded-full border border-orange-400/20" />
                  <div aria-hidden="true" className="absolute inset-[17%] rounded-full border border-dashed border-white/10" />
                  <img src={featuredCombo.imageUrl || (referenceFoodImage(featuredCombo) ? `${REFERENCE_ASSET}${referenceFoodImage(featuredCombo)}` : `${REFERENCE_ASSET}food-combo.webp`)}
                    alt={featuredCombo.name} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-5 transition-transform duration-700 group-hover:scale-105 sm:p-8" />
                  <span className="absolute bottom-4 left-5 font-display text-[16vw] font-black uppercase leading-none text-white/10 md:text-[9vw]">COMBO</span>
                </div>
                <div className="relative z-10 flex flex-col justify-center px-6 py-9 sm:px-10 md:col-span-5 md:px-12">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.3em] text-primary">// 02 — DESTAQUE DA CASA</p>
                  <h3 className="mt-4 font-display text-4xl font-black uppercase leading-[.9] tracking-tight sm:text-5xl">{featuredCombo.name}</h3>
                  <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">Uma combinação especial preparada para transformar sua próxima pausa em um momento memorável.</p>
                  <div className="mt-7 flex flex-wrap items-end gap-4">
                    <div><p className="font-mono text-[9px] uppercase tracking-[.2em] text-muted-foreground">A partir de</p><p className="font-display text-4xl font-black text-primary">{formatCurrency(getEffectivePrice(featuredCombo, promotions).price)}</p></div>
                    <button type="button" onClick={() => { const comboPrice = getEffectivePrice(featuredCombo, promotions).price; cartStore.add(featuredCombo.id, featuredCombo.name, comboPrice); toast.success(`${featuredCombo.name} adicionado!`, { duration: 1200 }); }}
                      disabled={getStock(featuredCombo.id) <= 0}
                      className="inline-flex items-center gap-2 rounded-full bg-[#ff6a00] px-6 py-3.5 text-xs font-black uppercase tracking-[.14em] text-white shadow-[0_12px_35px_rgba(255,106,0,.24)] transition-all hover:-translate-y-1 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50">
                      Adicionar combo <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button type="button" onClick={() => setCategoryFilter('combo')} className="mt-5 self-start font-mono text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground transition-colors hover:text-primary">Explorar todos os combos ↗</button>
                </div>
              </motion.section>
            ) : (
              <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18 }} className="mt-7 relative aspect-[82/27] overflow-hidden rounded-[1.5rem] border border-[#F8D8B1] bg-[#FFF0DC] shadow-[0_16px_40px_rgba(140,76,20,.10)]">
                <button onClick={() => setCategoryFilter('combo')} className="absolute inset-0 z-10 cursor-pointer" aria-label="Ver combos" />
                <img src={`${REFERENCE_ASSET}combo-banner.webp`} alt="Combos especiais" className="absolute inset-0 block h-full w-full object-cover object-center" />
              </motion.section>
            )}
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
                { id: 'pix', label: 'Pix', sub: 'Confirmar com a equipe', icon: QrCode, color: 'text-teal-600', bg: 'bg-teal-50', hover: 'hover:border-teal-500' },
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
            <h2 className="text-3xl sm:text-6xl font-display font-extrabold text-foreground mb-4">Pedido recebido!</h2>
            <p className="text-lg sm:text-2xl text-muted-foreground font-bold mb-6 sm:mb-8">Seu número de chamada é:</p>
            <div className="text-6xl sm:text-9xl font-display font-black text-primary bg-white px-12 sm:px-24 py-8 sm:py-12 rounded-[3rem] shadow-2xl mb-6 sm:mb-8 border-4 border-white/50">
              {createdOrder.code}
            </div>
            <div className="bg-card border border-border text-foreground px-6 sm:px-8 py-3 sm:py-4 rounded-full mb-8 sm:mb-12 font-mono text-sm sm:text-xl font-bold tracking-widest text-center shadow-sm">
              CÓDIGO: {createdOrder.paymentCode}
            </div>

            <div className="mb-8 flex w-full max-w-2xl items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left sm:p-6">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <h3 className="font-black text-amber-900">Pagamento pendente de confirmação</h3>
                <p className="mt-1 text-sm leading-relaxed text-amber-800">
                  {createdOrder.paymentMethod === 'pix'
                    ? 'O sistema ainda não gera cobrança Pix. Peça a chave ao atendente e aguarde a confirmação do pagamento.'
                    : 'Faça o pagamento no balcão ou na maquininha. A equipe confirmará o recebimento no painel.'}
                </p>
              </div>
            </div>

            <div className="bg-card p-6 sm:p-8 rounded-[2rem] flex flex-col sm:flex-row items-center gap-6 sm:gap-8 mb-8 sm:mb-12 max-w-2xl w-full border border-border shadow-sm text-foreground">
              <div className="bg-white p-3 rounded-2xl shadow-lg">
                <QRCodeSVG value={`${window.location.origin}${import.meta.env.BASE_URL}acompanhar/${createdOrder.trackingToken ?? createdOrder.code}`} size={100} />
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

      <AnimatePresence>
        {menuQrOpen && establishmentMenuUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.button
              type="button"
              aria-label="Fechar QR code"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
              onClick={() => setMenuQrOpen(false)}
            />
            <motion.section
              role="dialog" aria-modal="true" aria-labelledby="menu-qr-title"
              initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="relative z-10 w-full max-w-sm rounded-[2rem] bg-card p-6 text-center shadow-2xl sm:p-8"
            >
              <button type="button" onClick={() => setMenuQrOpen(false)} aria-label="Fechar" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
              <p className="text-xs font-black uppercase tracking-[.18em] text-primary">Compartilhe</p>
              <h2 id="menu-qr-title" className="mt-2 text-2xl font-black text-foreground">QR code do cardápio</h2>
              <p className="mt-2 text-sm text-muted-foreground">Escaneie com outro celular para abrir o cardápio deste estabelecimento.</p>
              <div className="mx-auto mt-6 inline-flex rounded-2xl bg-white p-4 shadow-sm">
                <QRCodeSVG value={establishmentMenuUrl} size={240} level="H" includeMargin />
              </div>
              <p className="mt-4 break-all text-xs text-muted-foreground">{establishmentMenuUrl}</p>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

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
              className={`relative w-full sm:max-w-md md:max-w-lg h-full shadow-2xl flex flex-col z-10 sm:rounded-l-[2rem] overflow-hidden ${isStarNexus ? "bg-[#15191f] text-white" : "bg-white text-gray-900"}`}>
              <div className={`p-6 sm:p-8 flex justify-between items-center border-b ${isStarNexus ? "bg-[#1d232d] border-white/10" : "bg-gray-50 border-gray-100"}`}>
                <h2 className={`text-2xl sm:text-3xl font-display font-extrabold flex items-center gap-3 ${isStarNexus ? "text-white" : "text-gray-900"}`}>
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

              <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 hide-scrollbar ${isStarNexus ? "bg-[#15191f]" : "bg-white"}`}>
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
                            <h3 className={`font-bold text-lg sm:text-xl truncate mb-1 ${isStarNexus ? "text-white" : "text-gray-900"}`}>{item.name}</h3>
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
                <div className={`p-6 sm:p-8 border-t space-y-4 shrink-0 ${isStarNexus ? "bg-[#1d232d] border-white/10" : "bg-white border-gray-100"}`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-xl sm:text-2xl font-bold ${isStarNexus ? "text-white/70" : "text-gray-700"}`}>Total</span>
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
