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
import { useCart } from '../lib/cart-store';
import { QRCodeSVG } from 'qrcode.react';
import {
  Trash2, Plus, Minus, CreditCard, Wallet, Banknote, QrCode,
  ArrowLeft, CheckCircle2, ShoppingCart, X, MessageCircle,
  Sparkles, Heart, Loader2,
  Search, Info, ImageOff, LayoutGrid, UtensilsCrossed, CupSoda, Boxes, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomerAuth } from '../lib/customer-auth';
import { getMenuTemplate, MENU_TEMPLATE_STYLES } from '../lib/menu-templates';

const CATEGORY_TABS: Array<{ key: 'todos' | 'lanche' | 'bebida' | 'combo' | 'sazonal'; label: string; icon: LucideIcon }> = [
  { key: 'todos', label: 'Todos', icon: LayoutGrid },
  { key: 'lanche', label: CATEGORY_LABELS.lanche, icon: UtensilsCrossed },
  { key: 'bebida', label: CATEGORY_LABELS.bebida, icon: CupSoda },
  { key: 'combo', label: CATEGORY_LABELS.combo, icon: Boxes },
  { key: 'sazonal', label: 'Sazonais', icon: Sparkles },
];

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

/** Pick the higher-contrast label for a merchant-configurable accent color. */
function readableOnPrimary(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '0 0% 100%';
  const rgb = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  // #18222e has a luminance of approximately 0.015.
  const contrastWithDark = (luminance + 0.05) / 0.065;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithDark > contrastWithWhite ? '220 24% 12%' : '0 0% 100%';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [telefone, setTelefone] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [configuringProduct, setConfiguringProduct] = useState<ApiProduct | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const checkoutAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const { cart, cartStore } = useCart(establishmentId);

  // Queries — preservadas integralmente
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
      const cartItems = cart.map((i) => ({ productId: i.productId, qty: i.qty, variantId: i.variantId, modifierIds: i.modifierIds }));
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
      const matchesCategory = categoryFilter === 'todos'
        ? true
        : categoryFilter === 'sazonal'
          ? p.sazonal
          : p.categoria === categoryFilter;
      const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR');
      const matchesSearch = !normalizedSearch || `${p.name} ${p.description ?? ''} ${CATEGORY_LABELS[p.categoria as keyof typeof CATEGORY_LABELS] ?? p.categoria}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [products, categoryFilter, searchTerm]);

  const featuredCombo = products.find((p: ApiProduct) => p.categoria === 'combo' && p.disponivel);

  const loyaltyStatus = isAccountPhone && loyaltyRecord
    ? computeLoyaltyStatus(telefoneTrim, [loyaltyRecord])
    : null;

  const getStock = (productId: string) => stock.find((s) => s.productId === productId)?.quantidade ?? 0;
  const getCartQuantity = (productId: string) => cart.filter((item) => item.productId === productId).reduce((total, item) => total + item.qty, 0);
  const canAddToCart = (productId: string) => getCartQuantity(productId) < getStock(productId);

  const addProductToCart = (product: ApiProduct) => {
    if (!canAddToCart(product.id)) return;
    const hasOptions = Boolean(product.variants?.length || product.modifierGroups?.length);
    if (hasOptions) {
      setConfiguringProduct(product);
      setSelectedVariantId(product.variants?.[0]?.id ?? null);
      setSelectedModifierIds([]);
      return;
    }
    const price = getEffectivePrice(product, promotions).price;
    cartStore.add(product.id, product.name, price);
    toast.success(`${product.name} adicionado!`, { duration: 1200 });
  };

  const selectedConfigurationPrice = configuringProduct
    ? getEffectivePrice(configuringProduct, promotions).price
      + Number(configuringProduct.variants?.find((variant) => variant.id === selectedVariantId)?.priceDelta ?? 0)
      + (configuringProduct.modifierGroups ?? []).flatMap((group) => group.modifiers)
        .filter((modifier) => selectedModifierIds.includes(modifier.id))
        .reduce((sum, modifier) => sum + Number(modifier.priceDelta), 0)
    : 0;

  const configurationValid = Boolean(configuringProduct)
    && (!configuringProduct?.variants?.length || Boolean(selectedVariantId))
    && (configuringProduct?.modifierGroups ?? []).every((group) => {
      const count = group.modifiers.filter((modifier) => selectedModifierIds.includes(modifier.id)).length;
      return count >= group.minSelect && count <= group.maxSelect;
    });

  const toggleModifier = (groupId: string, modifierId: string, maxSelect: number) => {
    const group = configuringProduct?.modifierGroups?.find((group) => group.id === groupId);
    if (!group) return;
    setSelectedModifierIds((current) => {
      if (current.includes(modifierId)) return current.filter((id) => id !== modifierId);
      const selectedInGroup = current.filter((id) => group.modifiers.some((modifier) => modifier.id === id));
      if (selectedInGroup.length >= maxSelect) {
        return [...current.filter((id) => !group.modifiers.some((modifier) => modifier.id === id)), modifierId];
      }
      return [...current, modifierId];
    });
  };

  const confirmProductConfiguration = () => {
    if (!configuringProduct || !configurationValid || !canAddToCart(configuringProduct.id)) return;
    const variant = configuringProduct.variants?.find((item) => item.id === selectedVariantId);
    const modifiers = (configuringProduct.modifierGroups ?? []).flatMap((group) =>
      group.modifiers.filter((modifier) => selectedModifierIds.includes(modifier.id)).map((modifier) => modifier.name));
    const label = [variant?.name, ...modifiers].filter(Boolean).join(' • ');
    cartStore.add(configuringProduct.id, configuringProduct.name, selectedConfigurationPrice, {
      variantId: selectedVariantId,
      modifierIds: selectedModifierIds,
      customizationLabel: label,
    });
    toast.success(`${configuringProduct.name} adicionado!`, { duration: 1200 });
    setConfiguringProduct(null);
  };

  const whatsappNumber = settings?.whatsappNumero?.replace(/\D/g, '');
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : null;
  const menuPrimary = settings?.menuPrimaryColor ?? '#ff6600';
  const menuBackground = settings?.menuBackgroundColor ?? '#f7f3ed';
  const menuTemplate = getMenuTemplate(menuPrimary, menuBackground);
  const isDarkTheme = menuTemplate.dark;
  const menuTheme = {
    '--primary': hexToHsl(menuPrimary),
    '--ring': hexToHsl(menuPrimary),
    '--background': hexToHsl(menuBackground),
    '--primary-foreground': readableOnPrimary(menuPrimary),
    ...(isDarkTheme ? {
      '--foreground': '0 0% 96%',
      '--card': menuTemplate.id === 'luxury' ? '330 10% 13%' : '220 18% 11%',
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
    } : {
      '--foreground': '220 24% 16%',
      '--card': '0 0% 100%',
      '--card-foreground': '220 24% 16%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '220 24% 16%',
      '--border': '30 18% 86%',
      '--input': '30 18% 86%',
      '--muted': '30 22% 93%',
      '--muted-foreground': '220 10% 42%',
      '--secondary': '30 22% 93%',
      '--secondary-foreground': '220 24% 16%',
      '--accent': '30 35% 91%',
      '--accent-foreground': '220 24% 16%',
    }),
  } as CSSProperties;

  // ─── ESTILOS ADICIONAIS DE DESIGN (injetados via <style>) ──────────────────
  const enhancedStyles = `
    /* Noise & profundidade */
    .nexus-noise::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      opacity: .025;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    }

    /* Header glassmorphism melhorado */
    .nexus-header {
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
    }

    /* Category tabs — scroll snap */
    .nexus-cats { scroll-snap-type: x proximity; scroll-padding-inline: 1rem; }
    .nexus-cats button { scroll-snap-align: start; }

    /* Product card — hover ring premium */
    .nexus-card {
      transition: transform 220ms cubic-bezier(.34,1.56,.64,1), box-shadow 220ms ease, border-color 220ms ease;
    }
    .nexus-card:not([data-disabled]):hover {
      transform: translateY(-6px) scale(1.015);
    }

    /* Price — accent glow no dark */
    .menu-template-modern-dark .nexus-price,
    .menu-template-luxury .nexus-price {
      text-shadow: 0 0 24px hsl(var(--primary) / .5);
    }

    /* Hero — parallax leve na imagem */
    .nexus-hero-img { will-change: transform; }

    /* Cart badge pulse */
    @keyframes nexus-pulse {
      0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / .5); }
      50%       { box-shadow: 0 0 0 6px hsl(var(--primary) / 0); }
    }
    .nexus-cart-pulse { animation: nexus-pulse 2s ease infinite; }

    /* Combo section — shimmer */
    @keyframes nexus-shimmer {
      from { background-position: -200% center; }
      to   { background-position:  200% center; }
    }
    .nexus-shimmer {
      background: linear-gradient(90deg, transparent 0%, hsl(var(--primary)/.08) 50%, transparent 100%);
      background-size: 200% 100%;
      animation: none;
    }

    /* Scrollbar oculta */
    .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
    .hide-scrollbar::-webkit-scrollbar { display: none; }

    /* StarNexus animations (preservadas) */
    @keyframes starnexus-marquee { to { transform: translateX(-50%); } }
    .starnexus-grid {
      background-image:
        linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px);
      background-size: 54px 54px;
      mask-image: linear-gradient(to right, black, transparent 90%);
    }
    .starnexus-outline { color: transparent; -webkit-text-stroke: 1px rgba(255,255,255,.55); }
    .starnexus-orbit { transform: rotate(-28deg); box-shadow: 0 0 80px rgba(255,106,0,.06), inset 0 0 80px rgba(255,106,0,.04); }
    .starnexus-orbit-one { animation: starnexus-spin 55s linear infinite; }
    .starnexus-orbit-two { animation: starnexus-spin 75s linear infinite reverse; }
    @keyframes starnexus-spin { to { transform: rotate(332deg); } }
    @media (prefers-reduced-motion: reduce) {
      .starnexus-orbit-one, .starnexus-orbit-two, .starnexus-marquee > div { animation: none !important; }
    }

    /* Promo badge — shimmer pill */
    .nexus-promo-badge {
      background: linear-gradient(90deg, hsl(142 76% 36%), hsl(160 84% 39%));
      box-shadow: 0 2px 10px hsl(142 76% 36% / .35);
    }
    .menu-template-modern-dark .nexus-promo-badge,
    .menu-template-luxury .nexus-promo-badge {
      box-shadow: 0 2px 14px hsl(142 76% 36% / .5);
    }

    /* Sazonal badge */
    .nexus-sazonal-badge {
      background: linear-gradient(90deg, #f59e0b, #f97316);
      box-shadow: 0 2px 10px rgba(245,158,11,.4);
    }

    /* Fav button refined */
    .nexus-fav { transition: transform 180ms cubic-bezier(.34,1.56,.64,1), color 150ms ease; }
    .nexus-fav:hover, .nexus-fav[aria-pressed="true"] { transform: scale(1.06); }

    /* Search focus ring */
    .nexus-search-wrap:focus-within {
      border-color: hsl(var(--primary));
      box-shadow: 0 0 0 3px hsl(var(--primary) / .15);
    }

    /* Stock badge */
    .nexus-stock-low {
      background: hsl(var(--primary) / .12);
      color: hsl(var(--primary));
    }
  `;

  return (
    <div
      style={menuTheme}
      className={`nexus-noise menu-template-${menuTemplate.id} min-h-[100dvh] flex flex-col overflow-hidden relative bg-background`}
    >
      <style>{MENU_TEMPLATE_STYLES + enhancedStyles}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="nexus-header relative z-30 mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 pb-4 pt-4 sm:px-8 sm:pt-6 lg:px-12">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {/* Logo */}
          <motion.div
            whileHover={{ scale: 1.04 }}
            className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-2 shadow-lg sm:h-16 sm:w-16 ${isDarkTheme ? 'bg-[#1b2028] ring-white/10' : 'bg-white ring-black/5 shadow-black/8'}`}
          >
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt={`Logo de ${settings.nomeLoja || 'estabelecimento'}`} className="h-full w-full object-contain" />
            ) : (
              <span aria-hidden="true" className="font-display text-2xl font-black text-primary">
                {(settings?.nomeLoja || 'N').trim().charAt(0).toLocaleUpperCase('pt-BR')}
              </span>
            )}
          </motion.div>

          {/* Nome + tagline */}
          <div className="min-w-0">
            <p className="truncate text-base font-black tracking-tight text-foreground sm:text-xl">
              {settings?.nomeLoja || 'Seu estabelecimento'}
            </p>
            <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-primary sm:text-xs">
              Seu momento. Seu sabor.
            </p>
          </div>
        </div>

        {/* Ações do header */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Relógio */}
          <div className={`hidden rounded-full border border-border px-4 py-2 text-sm font-black text-foreground sm:block ${isDarkTheme ? 'bg-[#1b2028]/80' : 'bg-card/80'}`}>
            {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>

          <AnimatePresence>
            {view === 'menu' && (
              <motion.div
                initial={{ opacity: 0, scale: .9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: .9 }}
                className="flex gap-2"
              >
                {/* WhatsApp */}
                {whatsappUrl && <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: .92 }}
                  onClick={() => setWhatsappOpen(true)}
                  aria-label="Falar com a cantina"
                  className={`flex h-11 w-11 items-center justify-center rounded-full border border-border shadow-sm sm:h-12 sm:w-12 ${isDarkTheme ? 'bg-[#1b2028] text-emerald-400' : 'bg-card text-emerald-600'}`}
                >
                  <MessageCircle className="h-5 w-5" />
                </motion.button>}

                {/* Carrinho */}
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: .92 }}
                  onClick={() => setCartOpen(true)}
                  aria-label="Abrir carrinho"
                  className="nexus-cart-pulse relative flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg sm:h-12 sm:w-12"
                >
                  <ShoppingCart className="h-5 w-5" />
                  <AnimatePresence>
                    {cartCount > 0 && (
                      <motion.span
                        key={cartCount}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', bounce: .6 }}
                        className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-foreground px-1 text-[10px] font-black text-background"
                      >
                        {cartCount}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ── CATEGORY TABS ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {view === 'menu' && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="nexus-cats sticky top-0 z-20 mx-auto flex w-full max-w-[1500px] shrink-0 gap-2 overflow-x-auto border-b border-border/60 bg-background/90 px-4 pb-4 pt-3 backdrop-blur-2xl hide-scrollbar sm:gap-3 sm:px-8 lg:px-12"
          >
            {CATEGORY_TABS.map((tab) => {
              const isActive = categoryFilter === tab.key;
              const CategoryIcon = tab.icon;
              return (
                <motion.button
                  key={tab.key}
                  type="button"
                  aria-pressed={isActive}
                  aria-controls="menu-products"
                  onClick={() => setCategoryFilter(tab.key)}
                  whileTap={{ scale: .97 }}
                  className={`nexus-category-tab group inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border px-3 py-2.5 text-xs font-bold transition-[color,background-color,border-color,box-shadow] duration-200 sm:px-4 sm:text-sm ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:border-primary/40'
                  }`}
                >
                  <span className="nexus-category-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
                    <CategoryIcon className="h-[17px] w-[17px]" strokeWidth={1.9} />
                  </span>
                  {tab.label}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 pb-24 relative z-0 hide-scrollbar max-w-[1500px] w-full mx-auto">

        {/* ── VIEW: MENU ─────────────────────────────────────────────────── */}
        {view === 'menu' && (
          <>
            {/* Hero */}
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="menu-hero relative mb-8 mt-5 overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_20px_60px_rgba(0,0,0,.12)] sm:rounded-[2.5rem]"
            >
              {/* Accent blob */}
              <div className="menu-hero-accent pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl opacity-[.14]" />
              {/* Grid decorativo (dark themes) */}
              {isDarkTheme && <div className="starnexus-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />}

              <div className="relative z-10 flex flex-col gap-6 px-6 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:py-9">
                <div className="max-w-2xl">
                  <motion.p
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: .08 }}
                    className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[.2em] text-primary"
                  >
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Cardápio digital
                  </motion.p>

                  <motion.h2
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: .12 }}
                    className="font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl"
                  >
                    O que vamos{' '}
                    <span className="text-primary">pedir hoje?</span>
                  </motion.h2>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: .18 }}
                    className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base"
                  >
                    Confira nossas opções, escolha seus favoritos e faça seu pedido com praticidade.
                  </motion.p>

                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: .22 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: .96 }}
                    type="button"
                    onClick={() => document.getElementById('menu-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="nexus-primary-action mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:brightness-95"
                  >
                    Ver produtos <span aria-hidden="true">↓</span>
                  </motion.button>
                </div>

                {/* QR Code */}
                {establishmentMenuUrl && (
                  <motion.button
                    initial={{ opacity: 0, scale: .92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: .24 }}
                    whileHover={{ scale: 1.03, y: -2 }}
                    type="button"
                    onClick={() => setMenuQrOpen(true)}
                    aria-label="Ampliar QR code do cardápio"
                    className={`menu-qr inline-flex w-fit items-center gap-3 rounded-2xl border p-3 text-left transition-all hover:border-primary/50 hover:shadow-md ${isDarkTheme ? 'border-white/10 bg-background/60' : 'border-border bg-background'}`}
                  >
                    <span className="rounded-xl bg-white p-2 shadow-sm">
                      <QRCodeSVG value={establishmentMenuUrl} size={58} level="H" />
                    </span>
                    <span className="pr-2">
                      <span className="block text-xs font-extrabold text-foreground">Compartilhe</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">Acesse pelo QR Code</span>
                    </span>
                  </motion.button>
                )}
              </div>
            </motion.section>

            {/* Título da seção + busca */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.28em] text-primary">CARDÁPIO</p>
                <h3 className="mt-2 font-display text-3xl font-black uppercase tracking-tight text-foreground sm:text-5xl">
                  {categoryFilter === 'todos'
                    ? 'Descubra o cardápio'
                    : CATEGORY_TABS.find((tab) => tab.key === categoryFilter)?.label}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">Encontre seu próximo favorito.</p>
              </div>

              {/* Busca */}
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[280px]">
                <label htmlFor="menu-search" className="sr-only">Buscar produtos</label>
                <div className="nexus-search-wrap flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-card/80 px-4 shadow-sm transition-all">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="menu-search"
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar no cardápio..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <span aria-live="polite" className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {visibleProducts.length} {visibleProducts.length === 1 ? 'item' : 'itens'}
                  </span>
                  <AnimatePresence>
                    {searchTerm && (
                      <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* ── GRID DE PRODUTOS ──────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              id="menu-products"
              className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3"
            >
              {loadingProducts ? (
                // Skeleton
                <div className="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5" role="status" aria-label="Carregando produtos">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={`overflow-hidden rounded-[1.5rem] border p-2 sm:rounded-[1.8rem] sm:p-4 ${isDarkTheme ? 'border-white/10 bg-[#202630]' : 'border-border bg-card'}`}>
                      <div className={`aspect-square animate-pulse rounded-xl sm:aspect-[4/3] ${isDarkTheme ? 'bg-white/8' : 'bg-muted'}`} />
                      <div className={`mt-3 h-3 w-3/4 animate-pulse rounded-full ${isDarkTheme ? 'bg-white/8' : 'bg-muted'}`} />
                      <div className={`mt-2 h-2.5 w-1/2 animate-pulse rounded-full ${isDarkTheme ? 'bg-white/5' : 'bg-muted/70'}`} />
                      <div className={`mt-4 h-9 w-full animate-pulse rounded-full ${isDarkTheme ? 'bg-white/8' : 'bg-muted'}`} />
                    </div>
                  ))}
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {visibleProducts.map((product: ApiProduct) => {
                    const available = getStock(product.id);
                    const isOutOfStock = available <= 0;
                    const disabled = isOutOfStock;
                    const canAddMore = canAddToCart(product.id);
                    const { price, original, label } = getEffectivePrice(product, promotions);
                    const hasPromo = label !== null;
                    const stockLow = available > 0 && available <= 3;

                    return (
                      <motion.article
                        layout
                        initial={{ opacity: 0, scale: 0.95, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={product.id}
                        aria-label={product.name}
                        data-disabled={disabled || undefined}
                        className={`nexus-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.35rem] border text-left sm:rounded-[1.8rem] ${
                          isDarkTheme
                            ? 'border-white/[.08] bg-gradient-to-b from-[#202630] to-[#15191f] shadow-[0_16px_40px_rgba(0,0,0,.28)]'
                            : 'border-black/[.04] bg-white shadow-[0_6px_20px_rgba(36,31,24,.06)]'
                        } ${disabled ? 'cursor-not-allowed opacity-50 grayscale' : 'cursor-pointer'}`}
                      >
                        {/* Badges */}
                        <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5">
                          {product.sazonal && (
                            <span className="nexus-sazonal-badge flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black text-white">
                              <Sparkles className="w-2.5 h-2.5" /> SAZONAL
                            </span>
                          )}
                          {hasPromo && (
                            <span className="nexus-promo-badge flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black text-white">
                              {label}
                            </span>
                          )}
                          {stockLow && !hasPromo && (
                            <span className="nexus-stock-low flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                              Últimas {available}
                            </span>
                          )}
                        </div>

                        {/* Fav */}
                        <motion.button
                          type="button"
                          aria-label={favoriteIds.includes(product.id) ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}
                          aria-pressed={favoriteIds.includes(product.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFavoriteIds((ids) => ids.includes(product.id) ? ids.filter((id) => id !== product.id) : [...ids, product.id]);
                          }}
                          className={`nexus-fav absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-sm ${
                            favoriteIds.includes(product.id)
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : isDarkTheme
                                ? 'border-white/10 bg-black/30 text-white/50 hover:text-primary hover:border-primary/40'
                                : 'border-border bg-white/80 text-muted-foreground hover:text-primary hover:border-primary/40'
                          }`}
                        >
                          <Heart className={`h-3.5 w-3.5 ${favoriteIds.includes(product.id) ? 'fill-current' : ''}`} />
                        </motion.button>

                        {/* Imagem */}
                        <div className={`relative mb-0 flex aspect-square w-full items-center justify-center overflow-hidden sm:aspect-[4/3] ${isDarkTheme ? 'bg-[#1a2130]' : 'bg-[#f5f0e8]'}`}>
                          <motion.div
                            whileHover={disabled ? {} : { scale: 1.06, rotate: 2 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            className="nexus-hero-img w-full h-full flex items-center justify-center"
                          >
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 text-primary/60">
                                <ImageOff className="h-9 w-9 sm:h-11 sm:w-11" strokeWidth={1.35} aria-hidden="true" />
                                <span className="text-[9px] font-bold uppercase tracking-[.18em] text-muted-foreground">Sem foto</span>
                              </div>
                            )}
                          </motion.div>

                          {/* Overlay esgotado */}
                          {disabled && (
                            <div className={`absolute inset-0 flex items-center justify-center backdrop-blur-[1.5px] ${isDarkTheme ? 'bg-black/50' : 'bg-foreground/15'}`}>
                              <div className="bg-[#242a33] text-white font-black px-4 py-2 rounded-full text-xs sm:text-sm shadow-xl -rotate-6 border border-white/20 tracking-wider">
                                ESGOTADO
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex flex-1 flex-col justify-end p-3 sm:p-4">
                          <div className="mb-3 min-h-[2.1em]">
                            <h3 className="line-clamp-2 font-display text-xs font-black uppercase leading-tight tracking-tight text-foreground sm:text-[1.05rem]">
                              {product.name}
                            </h3>
                            {product.description && (
                              <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
                                {product.description}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-end gap-2 mt-auto">
                            <div className="flex items-baseline gap-1.5">
                              <span className="nexus-price font-display text-xl font-black text-primary sm:text-2xl">
                                {formatCurrency(price)}
                              </span>
                              {hasPromo && (
                                <span className="text-[10px] sm:text-xs font-bold text-muted-foreground line-through">
                                  {formatCurrency(original)}
                                </span>
                              )}
                            </div>

                            <motion.button
                              type="button"
                              disabled={disabled || !canAddMore}
                              whileTap={disabled ? {} : { scale: .88 }}
                              onClick={() => {
                                if (!canAddToCart(product.id)) return;
                                addProductToCart(product);
                              }}
                              className="nexus-primary-action ml-auto inline-flex min-h-[2.6rem] items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-[10px] font-extrabold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-10 sm:gap-2 sm:px-4 sm:text-xs"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                              {disabled ? 'Esgotado' : canAddMore ? 'Adicionar' : 'Limite'}
                            </motion.button>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}

                  {/* Estado vazio */}
                  {!loadingProducts && visibleProducts.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`col-span-full rounded-[1.8rem] border border-dashed border-border px-5 py-16 text-center ${isDarkTheme ? 'bg-[#171c24]' : 'bg-card/70'}`}
                    >
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                        <Search className="h-6 w-6" />
                      </div>
                      <p className="font-display text-lg font-black text-foreground">
                        {searchTerm.trim() ? 'Nenhum resultado' : 'Prateleira vazia'}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {searchTerm.trim() ? 'Tente outro nome ou categoria.' : 'Ainda não há itens disponíveis.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => { setCategoryFilter('todos'); setSearchTerm(''); }}
                        className="mt-5 rounded-full border border-primary/30 bg-primary/10 px-5 py-2.5 text-xs font-black text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        {searchTerm.trim() ? 'Limpar busca' : 'Ver todo o cardápio'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </motion.div>

            {/* ── COMBO DESTAQUE ──────────────────────────────────────────── */}
            {featuredCombo && categoryFilter === 'todos' && !searchTerm.trim() ? (
              <motion.section
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: .15 }}
                className={`group relative mt-10 grid min-h-[360px] overflow-hidden rounded-[2rem] border shadow-[0_28px_70px_rgba(0,0,0,.14)] md:mt-14 md:min-h-[470px] md:grid-cols-12 ${isDarkTheme ? 'border-white/10 bg-[#171c24]' : 'border-border bg-card'}`}
              >
                {/* Shimmer overlay */}
                <div className="nexus-shimmer pointer-events-none absolute inset-0 z-10" aria-hidden="true" />

                {/* Imagem */}
                <div className="relative min-h-[250px] overflow-hidden md:col-span-7 md:min-h-[470px]">
                  <div aria-hidden="true" className="nexus-featured-glow absolute inset-0" />
                  <div aria-hidden="true" className="absolute inset-[8%] rounded-full border border-primary/20" />
                  <div aria-hidden="true" className="absolute inset-[17%] rounded-full border border-dashed border-white/8" />
                  {featuredCombo.imageUrl ? (
                    <img
                      src={featuredCombo.imageUrl}
                      alt={featuredCombo.name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-contain p-5 transition-transform duration-700 group-hover:scale-105 sm:p-8"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-primary/70">
                      <ShoppingCart className="h-16 w-16" strokeWidth={1.2} aria-hidden="true" />
                      <span className="text-xs font-bold uppercase tracking-[.2em] text-muted-foreground">Destaque da casa</span>
                    </div>
                  )}
                  <span className="nexus-featured-wordmark absolute bottom-4 left-5 select-none font-display text-[16vw] font-black uppercase leading-none md:text-[9vw]">
                    COMBO
                  </span>
                </div>

                {/* Texto */}
                <div className="relative z-20 flex flex-col justify-center px-6 py-9 sm:px-10 md:col-span-5 md:px-12">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.3em] text-primary">EM DESTAQUE</p>
                  <h3 className="mt-4 font-display text-4xl font-black uppercase leading-[.9] tracking-tight text-foreground sm:text-5xl">
                    {featuredCombo.name}
                  </h3>
                  {featuredCombo.description && (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">{featuredCombo.description}</p>
                  )}
                  <div className="mt-7 flex flex-wrap items-end gap-4">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[.2em] text-muted-foreground">Preço do combo</p>
                      <p className="font-display text-4xl font-black text-primary">
                        {formatCurrency(getEffectivePrice(featuredCombo, promotions).price)}
                      </p>
                    </div>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.04, y: -2 }}
                      whileTap={{ scale: .95 }}
                      onClick={() => addProductToCart(featuredCombo)}
                      disabled={!canAddToCart(featuredCombo.id)}
                      className="nexus-primary-action inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-xs font-black uppercase tracking-[.14em] text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {getStock(featuredCombo.id) <= 0 ? 'Esgotado' : canAddToCart(featuredCombo.id) ? 'Adicionar combo' : 'Limite atingido'}
                      <Plus className="h-4 w-4" />
                    </motion.button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('combo')}
                    className="mt-5 self-start font-mono text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground transition-colors hover:text-primary"
                  >
                    Explorar todos os combos ↗
                  </button>
                </div>
              </motion.section>
            ) : (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: .15 }}
                className={`menu-empty-feature mt-8 flex flex-col gap-4 rounded-2xl border border-border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 ${isDarkTheme ? 'bg-[#1b2028]' : 'bg-card'}`}
              >
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-primary">Uma boa escolha</p>
                  <h3 className="mt-2 font-display text-xl font-extrabold text-foreground sm:text-2xl">Explore todas as opções</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Veja os produtos disponíveis e encontre seu próximo favorito.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('todos')}
                  className="nexus-primary-action w-fit rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground transition-all hover:brightness-95"
                >
                  Ver cardápio
                </button>
              </motion.section>
            )}
          </>
        )}

        {/* ── VIEW: PAGAMENTO ───────────────────────────────────────────────── */}
        {view === 'payment' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto h-full flex flex-col justify-center items-center pt-8 sm:pt-12 text-foreground"
          >
            <button
              onClick={() => setView('menu')}
              className={`absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2 font-bold text-sm sm:text-base px-4 sm:px-6 py-3 rounded-2xl transition-colors border border-border shadow-sm ${isDarkTheme ? 'bg-[#1b2028] text-foreground hover:bg-[#242a33]' : 'bg-card text-foreground hover:bg-muted'}`}
            >
              <ArrowLeft className="w-4 h-4" /> Voltar ao Cardápio
            </button>

            <h2 className="text-3xl sm:text-5xl font-display font-extrabold text-foreground mb-4 text-center px-4 tracking-tight">
              Como você quer pagar?
            </h2>
            <div className={`text-primary text-2xl sm:text-3xl font-black px-8 py-4 rounded-full shadow-lg mb-8 sm:mb-12 border border-border ${isDarkTheme ? 'bg-[#1b2028]' : 'bg-card'}`}>
              Total: {formatCurrency(totalCart)}
            </div>

            {loyaltyStatus && (
              <div className={`border border-border rounded-2xl px-6 sm:px-8 py-4 mb-8 sm:mb-12 flex items-center gap-3 sm:gap-4 text-base font-bold max-w-2xl text-center shadow-sm ${isDarkTheme ? 'bg-[#1b2028]' : 'bg-accent'} text-foreground`}>
                <Heart className="w-6 h-6 text-primary shrink-0 fill-primary" />
                {loyaltyStatus.ganhouBrinde
                  ? 'Parabéns! Você ganhou um brinde de fidelidade neste pedido!'
                  : `Faltam ${loyaltyStatus.restantes} pedido(s) para ganhar um brinde de fidelidade.`}
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full px-4 sm:px-0">
              {[
                { id: 'pix', label: 'Pix', sub: 'Confirmar com a equipe', icon: QrCode, color: isDarkTheme ? 'text-teal-300' : 'text-teal-600', bg: isDarkTheme ? 'bg-teal-400/10' : 'bg-teal-50', hover: 'hover:border-teal-500/60' },
                { id: 'credito', label: 'Crédito', sub: 'Na maquininha', icon: CreditCard, color: isDarkTheme ? 'text-blue-300' : 'text-blue-600', bg: isDarkTheme ? 'bg-blue-400/10' : 'bg-blue-50', hover: 'hover:border-blue-500/60' },
                { id: 'debito', label: 'Débito', sub: 'Na maquininha', icon: Wallet, color: isDarkTheme ? 'text-indigo-300' : 'text-indigo-600', bg: isDarkTheme ? 'bg-indigo-400/10' : 'bg-indigo-50', hover: 'hover:border-indigo-500/60' },
                { id: 'dinheiro', label: PAYMENT_LABELS.dinheiro, sub: 'No balcão', icon: Banknote, color: isDarkTheme ? 'text-emerald-300' : 'text-emerald-600', bg: isDarkTheme ? 'bg-emerald-400/10' : 'bg-emerald-50', hover: 'hover:border-emerald-500/60' },
              ].map((method) => {
                const Icon = method.icon;
                return (
                  <motion.button
                    whileHover={{ y: -8, scale: 1.03 }}
                    whileTap={{ scale: .94 }}
                    key={method.id}
                    disabled={checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate(method.id)}
                    className={`p-6 sm:p-10 rounded-[2rem] shadow-xl border border-border ${isDarkTheme ? 'bg-[#1b2028]' : 'bg-card'} ${method.hover} transition-all flex flex-col items-center justify-center gap-4 group disabled:opacity-60`}
                  >
                    <div className={`w-16 h-16 sm:w-20 sm:h-20 ${method.bg} ${method.color} rounded-full flex items-center justify-center transition-transform group-hover:scale-110`}>
                      {checkoutMutation.isPending ? <Loader2 className="w-8 h-8 animate-spin" /> : <Icon className="w-8 h-8 sm:w-10 sm:h-10" strokeWidth={2} />}
                    </div>
                    <div className="text-center">
                      <span className="block text-lg sm:text-xl font-display font-bold text-foreground mb-0.5">{method.label}</span>
                      <span className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">{method.sub}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── VIEW: SUCESSO ─────────────────────────────────────────────────── */}
        {view === 'success' && createdOrder && (
          <motion.div
            initial={{ opacity: 0, scale: .95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-4xl mx-auto h-full flex flex-col justify-center items-center text-center py-8 sm:py-12 px-4 text-foreground"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: .5, delay: .15 }}
              className="w-24 h-24 sm:w-28 sm:h-28 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,.5)] mb-6 sm:mb-8"
            >
              <CheckCircle2 className="w-12 h-12 sm:w-14 sm:h-14" strokeWidth={2.5} />
            </motion.div>

            <h2 className="text-3xl sm:text-6xl font-display font-extrabold text-foreground mb-3 tracking-tight">Pedido recebido!</h2>
            <p className="text-base sm:text-xl text-muted-foreground font-bold mb-6">Seu número de chamada é:</p>

            <motion.div
              initial={{ scale: .8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: .25, type: 'spring', bounce: .4 }}
              className={`text-6xl sm:text-9xl font-display font-black text-primary px-12 sm:px-24 py-8 sm:py-12 rounded-[3rem] shadow-2xl mb-6 border border-border ${isDarkTheme ? 'bg-[#1b2028]' : 'bg-card'}`}
            >
              {createdOrder.code}
            </motion.div>

            <div className={`px-6 sm:px-8 py-3 rounded-full mb-8 font-mono text-sm sm:text-lg font-bold tracking-widest shadow-sm border border-border ${isDarkTheme ? 'bg-[#1b2028]' : 'bg-card'}`}>
              CÓDIGO: {createdOrder.paymentCode}
            </div>

            <div className={`mb-8 flex w-full max-w-2xl items-start gap-4 rounded-2xl border p-5 text-left sm:p-6 ${isDarkTheme ? 'border-amber-400/20 bg-amber-400/8' : 'border-amber-200 bg-amber-50'}`}>
              <Info className={`mt-0.5 h-5 w-5 shrink-0 ${isDarkTheme ? 'text-amber-300' : 'text-amber-700'}`} />
              <div>
                <h3 className={`font-black ${isDarkTheme ? 'text-amber-200' : 'text-amber-900'}`}>Pagamento pendente de confirmação</h3>
                <p className={`mt-1 text-sm leading-relaxed ${isDarkTheme ? 'text-amber-100/80' : 'text-amber-800'}`}>
                  {createdOrder.paymentMethod === 'pix'
                    ? 'O sistema ainda não gera cobrança Pix. Peça a chave ao atendente e aguarde a confirmação do pagamento.'
                    : 'Faça o pagamento no balcão ou na maquininha. A equipe confirmará o recebimento no painel.'}
                </p>
              </div>
            </div>

            <div className={`p-6 sm:p-8 rounded-[2rem] flex flex-col sm:flex-row items-center gap-6 mb-8 max-w-2xl w-full border border-border shadow-sm ${isDarkTheme ? 'bg-[#1b2028]' : 'bg-card'} text-foreground`}>
              <div className="bg-white p-3 rounded-2xl shadow-md">
                <QRCodeSVG value={`${window.location.origin}${import.meta.env.BASE_URL}acompanhar/${createdOrder.trackingToken ?? createdOrder.code}`} size={100} />
              </div>
              <div className="text-center sm:text-left">
                <p className="font-display font-bold text-xl sm:text-2xl mb-1.5">Acompanhe pelo celular</p>
                <p className="text-muted-foreground font-medium text-sm sm:text-base">Escaneie para saber quando seu pedido estiver pronto!</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: .97 }}
                onClick={() => { setCreatedOrder(null); setTelefone(''); setView('menu'); }}
                className="w-full sm:w-auto bg-primary text-primary-foreground px-10 sm:px-16 py-5 sm:py-6 rounded-2xl sm:rounded-3xl font-black text-xl sm:text-2xl hover:brightness-95 transition-all shadow-xl"
              >
                Fazer Novo Pedido
              </motion.button>
            </div>
          </motion.div>
        )}
      </main>

      {/* ── MODAL QR MENU ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {menuQrOpen && establishmentMenuUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.button
              type="button"
              aria-label="Fechar QR code"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-md"
              onClick={() => setMenuQrOpen(false)}
            />
            <motion.section
              role="dialog" aria-modal="true" aria-labelledby="menu-qr-title"
              initial={{ opacity: 0, scale: .92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: .92, y: 16 }}
              className={`relative z-10 w-full max-w-sm rounded-[2rem] p-6 text-center shadow-2xl sm:p-8 border border-border ${isDarkTheme ? 'bg-[#1b2028]' : 'bg-card'}`}
            >
              <button type="button" onClick={() => setMenuQrOpen(false)} aria-label="Fechar" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
              <p className="text-xs font-black uppercase tracking-[.18em] text-primary">Compartilhe</p>
              <h2 id="menu-qr-title" className="mt-2 text-2xl font-black text-foreground">QR code do cardápio</h2>
              <p className="mt-2 text-sm text-muted-foreground">Escaneie com outro celular para abrir o cardápio.</p>
              <div className="mx-auto mt-6 inline-flex rounded-2xl bg-white p-4 shadow-sm">
                <QRCodeSVG value={establishmentMenuUrl} size={240} level="H" includeMargin />
              </div>
              <p className="mt-4 break-all text-xs text-muted-foreground">{establishmentMenuUrl}</p>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL WHATSAPP ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {whatsappOpen && whatsappUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setWhatsappOpen(false)}
            />
            <motion.div
              initial={{ scale: .9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: .9, opacity: 0, y: 20 }}
              className={`relative rounded-[2rem] p-8 sm:p-10 max-w-sm w-full text-center shadow-2xl z-10 border border-border ${isDarkTheme ? 'bg-[#1b2028] text-white' : 'bg-card text-foreground'}`}
            >
              <button aria-label="Fechar contato" onClick={() => setWhatsappOpen(false)} className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
              <div className={`w-18 h-18 rounded-full flex items-center justify-center mx-auto mb-6 ${isDarkTheme ? 'bg-emerald-400/10 text-emerald-300' : 'bg-emerald-100 text-emerald-600'}`}>
                <MessageCircle className="w-10 h-10" strokeWidth={2} />
              </div>
              <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mb-2">Fale conosco</h3>
              <p className="text-muted-foreground mb-8 font-medium text-sm">Escaneie para conversar pelo WhatsApp.</p>
              <div className="flex justify-center bg-white p-6 rounded-3xl border border-border shadow-inner">
                <QRCodeSVG value={whatsappUrl} size={180} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── CART DRAWER ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {cartOpen && (
          <div className="fixed inset-0 z-40 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setCartOpen(false)}
            />
            <motion.aside
              role="dialog" aria-modal="true" aria-labelledby="cart-title"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className={`relative w-full sm:max-w-md md:max-w-lg h-full shadow-2xl flex flex-col z-10 sm:rounded-l-[2rem] overflow-hidden ${isDarkTheme ? 'bg-[#13171e] text-white' : 'bg-white text-gray-900'}`}
            >
              {/* Header do carrinho */}
              <div className={`p-6 sm:p-8 flex justify-between items-center border-b ${isDarkTheme ? 'bg-[#1b2028] border-white/8' : 'bg-gray-50 border-gray-100'}`}>
                <h2 id="cart-title" className="text-2xl sm:text-3xl font-display font-extrabold flex items-center gap-3 text-foreground">
                  <ShoppingCart className="w-6 h-6 sm:w-7 sm:h-7 text-primary" /> Seu Pedido
                </h2>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button
                      aria-label="Limpar carrinho"
                      onClick={() => cartStore.clear()}
                      className="text-muted-foreground hover:text-red-500 font-bold px-3 py-2 rounded-full hover:bg-red-500/10 transition-colors flex items-center gap-1.5 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Limpar</span>
                    </button>
                  )}
                  <button
                    aria-label="Fechar carrinho"
                    onClick={() => setCartOpen(false)}
                    className={`w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full border border-border transition-colors ${isDarkTheme ? 'bg-[#242a33] hover:bg-[#2e3540]' : 'bg-card hover:bg-muted'} text-muted-foreground hover:text-foreground`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Items */}
              <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 hide-scrollbar ${isDarkTheme ? 'bg-[#13171e]' : 'bg-white'}`}>
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                    <div className={`w-28 h-28 rounded-full flex items-center justify-center mb-6 ${isDarkTheme ? 'bg-[#1b2028] border border-white/8' : 'bg-muted'}`}>
                      <ShoppingCart className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-display font-bold text-foreground mb-1.5">Carrinho vazio</h3>
                    <p className="text-sm font-medium text-muted-foreground">Toque nos itens para adicionar.</p>
                    <button
                      type="button"
                      onClick={() => { setCartOpen(false); document.getElementById('menu-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                      className="mt-5 min-h-11 rounded-full bg-primary px-6 text-sm font-extrabold text-primary-foreground transition hover:brightness-95"
                    >
                      Explorar produtos
                    </button>
                  </div>
                ) : (
                  <>
                    <AnimatePresence>
                      {cart.map((item) => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: .92, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: .92, x: 24 }}
                          key={item.key}
                          className={`rounded-2xl p-3.5 flex gap-3.5 items-center border ${isDarkTheme ? 'bg-[#1b2028] border-white/8' : 'bg-muted/50 border-border'}`}
                        >
                          <div className={`text-3xl w-16 h-16 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${isDarkTheme ? 'bg-[#13171e] border border-white/8' : 'bg-card border border-border'}`}>
                            {products.find((p: ApiProduct) => p.id === item.productId)?.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-base truncate mb-0.5 text-foreground">{item.name}</h3>
                            {item.customizationLabel && <p className="mb-1 text-xs text-muted-foreground line-clamp-1">{item.customizationLabel}</p>}
                            <p className="text-primary font-black">{formatCurrency(item.price * item.qty)}</p>
                          </div>
                          <div className={`flex items-center gap-1 rounded-xl p-1 border ${isDarkTheme ? 'bg-[#13171e] border-white/8' : 'bg-card border-border'}`}>
                            <button type="button" aria-label={`Diminuir ${item.name}`} onClick={() => cartStore.decrement(item.key)}
                              className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg active:scale-90 transition-all">
                              <Minus className="w-4 h-4" strokeWidth={3} />
                            </button>
                            <span className="font-black text-base w-6 text-center text-foreground">{item.qty}</span>
                            <button type="button" aria-label={`Adicionar mais ${item.name}`}
                              disabled={item.qty >= getStock(item.productId)}
                              onClick={() => {
                                const p = products.find((x: ApiProduct) => x.id === item.productId);
                                if (p && getCartQuantity(item.productId) < getStock(item.productId)) {
                                  cartStore.add(p.id, p.name, item.price, { variantId: item.variantId, modifierIds: item.modifierIds, customizationLabel: item.customizationLabel });
                                }
                              }}
                              className="w-9 h-9 flex items-center justify-center text-primary hover:bg-primary/10 rounded-lg active:scale-90 transition-all disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Plus className="w-4 h-4" strokeWidth={3} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {/* Observações + fidelidade */}
                    <div className="pt-4 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                          Observações (opcional)
                        </label>
                        <textarea
                          value={observacoes}
                          onChange={(e) => setObservacoes(e.target.value)}
                          placeholder="Ex: sem cebola, molho à parte..."
                          className={`w-full border border-border rounded-2xl p-4 text-sm resize-none h-20 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all font-medium bg-background text-foreground placeholder:text-muted-foreground`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                          <Heart className="inline w-3.5 h-3.5 text-pink-500 mr-1" />
                          Seu celular (fidelidade)
                        </label>
                        <input
                          type="tel"
                          value={telefone}
                          onChange={(e) => setTelefone(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="w-full border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-2xl px-4 py-3.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all font-medium"
                        />
                        {loyaltyStatus && (
                          <p className={`mt-2 text-xs font-bold ${loyaltyStatus.ganhouBrinde ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                            {loyaltyStatus.ganhouBrinde ? '🎉 Você ganhou um brinde!' : `Faltam ${loyaltyStatus.restantes} pedido(s) para o brinde`}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer do carrinho */}
              {cart.length > 0 && (
                <div className={`p-5 sm:p-6 border-t space-y-4 shrink-0 ${isDarkTheme ? 'bg-[#1b2028] border-white/8' : 'bg-white border-gray-100'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-muted-foreground">Total</span>
                    <span className="text-2xl sm:text-3xl font-black text-primary">{formatCurrency(totalCart)}</span>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: .97 }}
                    onClick={() => { setCartOpen(false); setView('payment'); }}
                    className="w-full bg-primary text-primary-foreground py-4.5 sm:py-5 rounded-2xl font-black text-lg sm:text-xl shadow-lg shadow-primary/25 hover:brightness-95 transition-all"
                  >
                    Escolher Pagamento →
                  </motion.button>
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL CONFIGURAR PRODUTO ──────────────────────────────────────── */}
      {configuringProduct && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-0 backdrop-blur-md sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfiguringProduct(null); }}
        >
          <motion.section
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            role="dialog" aria-modal="true" aria-labelledby="product-config-title"
            className={`max-h-[90dvh] w-full max-w-xl overflow-hidden rounded-t-[2rem] border shadow-2xl sm:rounded-[2rem] ${isDarkTheme ? 'border-white/10 bg-[#1b2028] text-white' : 'border-border bg-white text-gray-900'}`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/60 p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[.18em] text-primary">Personalize seu pedido</p>
                <h2 id="product-config-title" className="mt-1 text-xl font-black text-foreground">{configuringProduct.name}</h2>
                {configuringProduct.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{configuringProduct.description}</p>}
              </div>
              <button type="button" onClick={() => setConfiguringProduct(null)} aria-label="Fechar personalização"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="max-h-[58dvh] space-y-5 overflow-y-auto p-5 sm:p-6 hide-scrollbar">
              {!!configuringProduct.variants?.length && (
                <fieldset className="space-y-2.5">
                  <legend className="font-black text-foreground">
                    Escolha uma opção{' '}
                    <span className="text-xs font-semibold text-primary ml-1">Obrigatório</span>
                  </legend>
                  {configuringProduct.variants.map((variant) => (
                    <label key={variant.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${selectedVariantId === variant.id ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/40'}`}>
                      <input type="radio" name="product-variant" checked={selectedVariantId === variant.id} onChange={() => setSelectedVariantId(variant.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                      <span className="flex-1 font-semibold text-foreground text-sm">{variant.name}</span>
                      <span className="text-sm font-bold text-primary">{Number(variant.priceDelta) > 0 ? `+${formatCurrency(Number(variant.priceDelta))}` : 'Sem acréscimo'}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              {(configuringProduct.modifierGroups ?? []).map((group) => (
                <fieldset key={group.id} className="space-y-2.5">
                  <legend className="flex w-full items-center justify-between gap-3 font-black text-foreground">
                    <span>{group.name}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {group.minSelect > 0 ? `Escolha ${group.minSelect}+` : 'Opcional'} · até {group.maxSelect}
                    </span>
                  </legend>
                  {group.modifiers.map((modifier) => (
                    <label key={modifier.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${selectedModifierIds.includes(modifier.id) ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/40'}`}>
                      <input type="checkbox" name={`modifier-${group.id}`} checked={selectedModifierIds.includes(modifier.id)}
                        onChange={() => toggleModifier(group.id, modifier.id, group.maxSelect)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                      <span className="flex-1 font-semibold text-foreground text-sm">{modifier.name}</span>
                      <span className="text-sm font-bold text-primary">{Number(modifier.priceDelta) > 0 ? `+${formatCurrency(Number(modifier.priceDelta))}` : 'Grátis'}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>

            <div className={`flex items-center gap-4 border-t border-border/60 p-5 sm:p-6 ${isDarkTheme ? 'bg-[#13171e]' : 'bg-gray-50'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preço por unidade</p>
                <p className="text-2xl font-black text-primary">{formatCurrency(selectedConfigurationPrice)}</p>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: .93 }}
                disabled={!configurationValid || !canAddToCart(configuringProduct.id)}
                onClick={confirmProductConfiguration}
                className="min-h-12 rounded-full bg-primary px-7 text-sm font-black text-primary-foreground shadow-lg shadow-primary/25 disabled:cursor-not-allowed disabled:opacity-40 transition-all hover:brightness-95"
              >
                Adicionar
              </motion.button>
            </div>
          </motion.section>
        </div>
      )}
    </div>
  );
}