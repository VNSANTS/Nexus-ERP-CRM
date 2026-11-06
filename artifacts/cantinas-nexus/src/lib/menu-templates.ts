export interface MenuTemplate {
  id: string;
  name: string;
  description: string;
  mood: string;
  primary: string;
  background: string;
  dark: boolean;
}

export const MENU_TEMPLATES: MenuTemplate[] = [
  { id: 'modern-dark', name: 'Modern Dark', description: 'Escuro, tecnológico e marcante', mood: 'Urbano · Premium', primary: '#ff6a00', background: '#10141a', dark: true },
  { id: 'minimal', name: 'Minimal', description: 'Claro, limpo e direto ao ponto', mood: 'Leve · Essencial', primary: '#263238', background: '#f7f8fa', dark: false },
  { id: 'editorial', name: 'Editorial', description: 'Fotografia e tipografia em destaque', mood: 'Autoral · Acolhedor', primary: '#a34f38', background: '#f4ede3', dark: false },
  { id: 'vibrant', name: 'Vibrant', description: 'Cores vivas para uma marca cheia de energia', mood: 'Jovem · Expressivo', primary: '#f43f5e', background: '#fff1e8', dark: false },
  { id: 'luxury', name: 'Luxury', description: 'Visual sofisticado com detalhes dourados', mood: 'Elegante · Exclusivo', primary: '#b89555', background: '#171316', dark: true },
  { id: 'compact', name: 'Compact', description: 'Mais produtos visíveis e pedidos rápidos', mood: 'Prático · Objetivo', primary: '#2563eb', background: '#eff6ff', dark: false },
];

export function getMenuTemplate(primary?: string | null, background?: string | null): MenuTemplate {
  const normalizedPrimary = (primary ?? '').toLowerCase();
  const normalizedBackground = (background ?? '').toLowerCase();
  return MENU_TEMPLATES.find((template) =>
    template.primary === normalizedPrimary && template.background === normalizedBackground
  ) ?? MENU_TEMPLATES[2];
}

export const MENU_TEMPLATE_STYLES = `
/* Shared menu primitives */
.menu-hero { isolation:isolate; }
.menu-hero-accent { background:var(--primary); }
.menu-qr { box-shadow:0 8px 24px rgba(20,20,20,.06); }
#menu-products article { min-width:0; }
#menu-products article img { display:block; }
.menu-template-modern-dark { color-scheme:dark; }
.menu-template-luxury { color-scheme:dark; }
.menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-compact { color-scheme:light; }

/* Modern Dark — high contrast, restrained neon accent, dense product surfaces */
.menu-template-modern-dark .menu-hero { border-color:#34404e; background:linear-gradient(125deg,#17212d 0%,#101820 65%,#202b38 100%); }
.menu-template-modern-dark .menu-hero h2,.menu-template-modern-dark .menu-hero p { color:#f8fafc; }
.menu-template-modern-dark .menu-hero p:not(.text-primary) { color:#cbd5e1; }
.menu-template-modern-dark .menu-qr { background:#18212c; border-color:#354253; }
.menu-template-modern-dark .menu-qr span { color:#f8fafc; }
.menu-template-modern-dark #menu-products article { background:linear-gradient(160deg,#202b38,#151b24); border-color:#354253; }
.menu-template-modern-dark #menu-products article [class*=aspect-] { background:#263342; }

/* Minimal — airy spacing, quiet surfaces, typography-led */
.menu-template-minimal .menu-hero { border-radius:1.1rem; box-shadow:none; }
.menu-template-minimal .menu-hero-accent { display:none; }
.menu-template-minimal #menu-products article { border-radius:1rem; box-shadow:0 2px 12px rgba(15,23,42,.035); }
.menu-template-minimal #menu-products article [class*=aspect-] { border-radius:.75rem; }

/* Editorial — warm paper, serif headline, image-led composition */
.menu-template-editorial .menu-hero { border-radius:.75rem; background:#f8f1e8; border-color:#e8d9c8; }
.menu-template-editorial .menu-hero h2 { font-family:Georgia,serif; font-weight:500; letter-spacing:-.04em; }
.menu-template-editorial .menu-hero-accent { width:15rem; height:15rem; background:#a34f38; opacity:.10; }
.menu-template-editorial #menu-products article { border-radius:.8rem; border-color:#e7d8c7; box-shadow:0 8px 24px rgba(80,50,30,.06); }
.menu-template-editorial #menu-products article [class*=aspect-] { border-radius:.6rem; }

/* Vibrant — energetic color blocks without sacrificing legibility */
.menu-template-vibrant .menu-hero { border:0; border-radius:2rem; background:linear-gradient(120deg,#fff1f2,#fff7ed); }
.menu-template-vibrant .menu-hero-accent { background:#f43f5e; opacity:.12; }
.menu-template-vibrant #menu-products article { border-radius:1.35rem; border-color:#fecdd3; box-shadow:0 10px 26px rgba(190,24,93,.07); }
.menu-template-vibrant #menu-products article [class*=aspect-] { border-radius:1rem; }

/* Luxury — charcoal, warm metallic accent and calm spacing */
.menu-template-luxury .menu-hero { background:linear-gradient(135deg,#21191d,#30252b); border-color:rgba(184,149,85,.38); }
.menu-template-luxury .menu-hero h2,.menu-template-luxury .menu-hero p:not(.text-primary) { color:#f8f3e9; }
.menu-template-luxury .menu-hero p.text-primary { color:#d7b879; }
.menu-template-luxury .menu-qr { background:#30252b; border-color:rgba(184,149,85,.38); }
.menu-template-luxury .menu-qr span { color:#f8f3e9; }
.menu-template-luxury #menu-products article { background:linear-gradient(160deg,#30272c,#1d181c); border-color:rgba(184,149,85,.3); }
.menu-template-luxury #menu-products article [class*=aspect-] { background:#382d32; }

/* Compact — utility-first catalog, more products per row */
.menu-template-compact .menu-hero { padding:1.5rem; border-radius:1rem; }
.menu-template-compact .menu-hero h2 { font-size:clamp(1.8rem,5vw,3.2rem); }
.menu-template-compact #menu-products { gap:.75rem; }
.menu-template-compact #menu-products article { border-radius:.85rem; padding:.65rem; }
.menu-template-compact #menu-products article [class*=aspect-] { margin-bottom:.55rem; border-radius:.65rem; }
@media(min-width:1024px){.menu-template-compact #menu-products{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
@media(max-width:640px){.menu-hero{padding:1.35rem!important}.menu-qr{width:100%}}

/* Template identity layer — category navigation, search and interactive states */
.menu-template-modern-dark header { border-color:rgba(148,163,184,.12); }
.menu-template-modern-dark header + div { background:rgba(16,20,26,.88); border-color:rgba(148,163,184,.14); }
.menu-template-modern-dark header + div button:not([aria-pressed="true"]) { background:#1b232e; border-color:#354253; color:#dbe4ef; }
.menu-template-modern-dark main #menu-search,
.menu-template-luxury main #menu-search { color:#f8fafc; }
.menu-template-modern-dark main > div:has(#menu-search) > div:last-child > div,
.menu-template-luxury main > div:has(#menu-search) > div:last-child > div { background:#1b232e; border-color:#354253; }
.menu-template-modern-dark #menu-products article button[aria-pressed],
.menu-template-luxury #menu-products article button[aria-pressed] { background:#252b35; border-color:#46515f; }
.menu-template-modern-dark #menu-products article button[aria-pressed="true"],
.menu-template-luxury #menu-products article button[aria-pressed="true"] { color:#fff; border-color:var(--primary); }
.menu-template-modern-dark .menu-hero { box-shadow:0 24px 70px rgba(0,0,0,.22); }
.menu-template-modern-dark .menu-hero h2 { letter-spacing:-.055em; }
.menu-template-modern-dark #menu-products article { border-radius:1.35rem; }
.menu-template-modern-dark #menu-products article [class*=aspect-] { border-radius:1rem; }

.menu-template-minimal .menu-hero { border:1px solid #e8ebef; background:#fff; }
.menu-template-minimal .menu-hero h2 { font-weight:700; letter-spacing:-.045em; }
.menu-template-minimal header + div { background:rgba(247,248,250,.92); }
.menu-template-minimal #menu-products article { border:1px solid #e9edf1; }
.menu-template-minimal #menu-products article button[aria-pressed="true"] { box-shadow:0 0 0 3px rgba(38,50,56,.10); }

.menu-template-editorial .menu-hero { box-shadow:0 18px 48px rgba(92,57,36,.07); }
.menu-template-editorial .menu-hero h2 { font-size:clamp(2.25rem,5vw,4.5rem); line-height:1.02; }
.menu-template-editorial header + div { background:rgba(244,237,227,.94); }
.menu-template-editorial #menu-products article { background:#fffaf4; }
.menu-template-editorial #menu-products article h3 { font-family:Georgia,serif; font-size:clamp(.9rem,1.4vw,1.2rem); font-weight:700; text-transform:none; letter-spacing:-.02em; }
.menu-template-editorial #menu-products article button[aria-pressed="true"] { box-shadow:0 0 0 3px rgba(163,79,56,.12); }

.menu-template-vibrant .menu-hero { box-shadow:0 22px 55px rgba(244,63,94,.10); }
.menu-template-vibrant .menu-hero h2 { font-weight:900; letter-spacing:-.06em; }
.menu-template-vibrant header + div { background:rgba(255,241,232,.94); }
.menu-template-vibrant #menu-products article { border-width:1.5px; }
.menu-template-vibrant #menu-products article button[aria-pressed="true"] { box-shadow:0 0 0 3px rgba(244,63,94,.13); }

.menu-template-luxury header { border-color:rgba(184,149,85,.18); }
.menu-template-luxury header + div { background:rgba(23,19,22,.9); border-color:rgba(184,149,85,.18); }
.menu-template-luxury header + div button:not([aria-pressed="true"]) { background:#282126; border-color:rgba(184,149,85,.28); color:#e8dfd0; }
.menu-template-luxury .menu-hero { box-shadow:0 24px 75px rgba(0,0,0,.3); }
.menu-template-luxury .menu-hero h2 { font-family:Georgia,serif; font-weight:500; letter-spacing:-.045em; }
.menu-template-luxury #menu-products article h3 { font-family:Georgia,serif; font-weight:600; letter-spacing:-.025em; }
.menu-template-luxury #menu-products article button[aria-pressed="true"] { box-shadow:0 0 0 3px rgba(184,149,85,.16); }

.menu-template-compact .menu-hero { border:1px solid #dbeafe; background:linear-gradient(120deg,#fff,#eff6ff); }
.menu-template-compact .menu-hero h2 { letter-spacing:-.055em; }
.menu-template-compact header + div { background:rgba(239,246,255,.94); }
.menu-template-compact #menu-products article { border-color:#dbeafe; box-shadow:0 4px 14px rgba(37,99,235,.055); }
.menu-template-compact #menu-products article h3 { font-size:clamp(.72rem,1vw,.95rem); }
.menu-template-compact #menu-products article button[aria-pressed="true"] { box-shadow:0 0 0 3px rgba(37,99,235,.12); }

@media(max-width:640px){
  .menu-template-editorial .menu-hero h2 { font-size:2.15rem; }
  .menu-template-luxury .menu-hero { border-radius:1.15rem; }
  .menu-template-vibrant #menu-products article { border-radius:1.1rem; }
  .menu-template-compact #menu-products article { padding:.55rem; }
}

/* Inputs inherit the active menu palette instead of the app's global light defaults. */
.menu-template-modern-dark main #menu-search,
.menu-template-luxury main #menu-search {
  min-height:0;
  border:0;
  border-radius:0;
  background:transparent;
  color:#f8fafc;
  box-shadow:none;
}
.menu-template-modern-dark main #menu-search:focus,
.menu-template-luxury main #menu-search:focus { box-shadow:none; }
.menu-template-modern-dark .menu-empty-feature,
.menu-template-luxury .menu-empty-feature {
  background:#1d232d;
  border-color:rgba(255,255,255,.1);
}
.menu-template-modern-dark .menu-empty-feature h3,
.menu-template-luxury .menu-empty-feature h3 { color:#f8fafc; }
.menu-template-modern-dark .menu-empty-feature p:not(.text-primary),
.menu-template-luxury .menu-empty-feature p:not(.text-primary) { color:#aeb8c6; }
.menu-template-luxury .menu-empty-feature { border-color:rgba(184,149,85,.25); }

/* Nexus Menu Design System — refined shared layer */
:where(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) {
  --menu-card-radius: 1.25rem;
  --menu-card-shadow: 0 10px 30px rgba(25, 28, 34, .07);
  --menu-card-hover-shadow: 0 22px 44px rgba(25, 28, 34, .13);
  --menu-border: hsl(var(--foreground) / .10);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Header and category rail */
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) > header {
  min-height: 72px;
  border-bottom-color: var(--menu-border);
  background: color-mix(in srgb, hsl(var(--background)) 90%, transparent);
  backdrop-filter: blur(20px) saturate(145%);
  -webkit-backdrop-filter: blur(20px) saturate(145%);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats {
  border-bottom-color: var(--menu-border);
  padding-top: .7rem;
  padding-bottom: .8rem;
  box-shadow: 0 8px 22px rgba(20, 24, 30, .035);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats button {
  min-height: 44px;
  padding-inline: 1rem;
  letter-spacing: .005em;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats button[aria-pressed="true"] {
  box-shadow: 0 7px 18px hsl(var(--primary) / .2);
}

/* Hero and search hierarchy */
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .menu-hero {
  border-radius: clamp(1.25rem, 2.5vw, 2rem);
  box-shadow: var(--menu-card-shadow);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .menu-hero h2 {
  max-width: 13ch;
  line-height: 1.02;
  text-wrap: balance;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .menu-hero p:not(.text-primary) {
  max-width: 58ch;
  line-height: 1.7;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .menu-hero > div.relative {
  min-height: 220px;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-search-wrap {
  min-height: 52px;
  border-radius: 999px;
  box-shadow: 0 5px 18px rgba(20, 24, 30, .045);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-search-wrap:focus-within {
  box-shadow: 0 0 0 4px hsl(var(--primary) / .13), 0 8px 24px rgba(20, 24, 30, .07);
}

/* Product cards: consistent geometry, clear actions, balanced imagery */
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products {
  scroll-margin-top: 6.5rem;
  align-items: stretch;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article {
  min-height: 100%;
  border-radius: var(--menu-card-radius);
  border-color: var(--menu-border);
  box-shadow: var(--menu-card-shadow);
  isolation: isolate;
  transform: translateZ(0);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article .nexus-hero-img {
  overflow: hidden;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article .nexus-hero-img img {
  transition: transform 420ms cubic-bezier(.2, .7, .2, 1);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article h3 {
  line-height: 1.3;
  text-wrap: pretty;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article p {
  line-height: 1.55;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article .nexus-price {
  letter-spacing: -.045em;
  font-variant-numeric: tabular-nums;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article button:not(.nexus-fav) {
  min-height: 44px;
  padding-inline: .95rem;
  font-size: .72rem;
  letter-spacing: .015em;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-fav {
  width: 40px;
  height: 40px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .12);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-promo-badge,
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-sazonal-badge {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  letter-spacing: .045em;
}

/* Featured combo and QR surface */
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) main > section.group {
  border-radius: clamp(1.25rem, 2.5vw, 2rem);
  box-shadow: 0 20px 54px rgba(20, 24, 30, .11);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .menu-qr {
  min-height: 84px;
  border-radius: 1.25rem;
}

/* Keep each template recognizable */
.menu-template-minimal,
.menu-template-compact {
  --menu-card-radius: .95rem;
  --menu-card-shadow: 0 3px 16px rgba(15, 23, 42, .045);
  --menu-card-hover-shadow: 0 14px 30px rgba(15, 23, 42, .09);
}
.menu-template-editorial {
  --menu-card-radius: .95rem;
  --menu-card-shadow: 0 8px 26px rgba(80, 50, 30, .075);
  --menu-card-hover-shadow: 0 18px 38px rgba(80, 50, 30, .13);
}
.menu-template-vibrant {
  --menu-card-radius: 1.45rem;
  --menu-card-shadow: 0 10px 26px rgba(190, 24, 93, .085);
  --menu-card-hover-shadow: 0 20px 42px rgba(190, 24, 93, .15);
}
.menu-template-modern-dark {
  --menu-card-radius: 1.15rem;
  --menu-card-shadow: 0 14px 36px rgba(0, 0, 0, .24);
  --menu-card-hover-shadow: 0 24px 48px rgba(0, 0, 0, .36);
  --menu-border: rgba(148, 163, 184, .18);
}
.menu-template-luxury {
  --menu-card-radius: 1rem;
  --menu-card-shadow: 0 14px 34px rgba(0, 0, 0, .22);
  --menu-card-hover-shadow: 0 24px 48px rgba(0, 0, 0, .34);
  --menu-border: rgba(184, 149, 85, .24);
}
.menu-template-minimal #menu-products article h3,
.menu-template-compact #menu-products article h3,
.menu-template-editorial #menu-products article h3,
.menu-template-luxury #menu-products article h3 {
  text-transform: none;
  letter-spacing: -.02em;
}
.menu-template-editorial .menu-hero h2,
.menu-template-luxury .menu-hero h2 {
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 500;
}
.menu-template-vibrant .menu-hero {
  background-image: linear-gradient(125deg, rgba(255,255,255,.72), rgba(255,247,237,.38));
}

/* Desktop hover only; touch devices keep the layout stable */
@media (hover: hover) and (pointer: fine) {
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article:not([data-disabled]):hover {
    transform: translateY(-5px);
    border-color: hsl(var(--primary) / .34);
    box-shadow: var(--menu-card-hover-shadow);
  }
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article:not([data-disabled]):hover .nexus-hero-img img {
    transform: scale(1.035);
  }
}

@media (max-width: 640px) {
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) > header {
    min-height: 64px;
    padding-top: .7rem;
    padding-bottom: .7rem;
  }
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .menu-hero > div.relative {
    min-height: 0;
    gap: 1.15rem;
  }
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article {
    border-radius: 1rem;
  }
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article > div:last-child {
    padding: .8rem;
  }
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article button:not(.nexus-fav) {
    min-height: 42px;
    padding-inline: .72rem;
    font-size: .66rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article,
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products article img,
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cart-pulse {
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
}


/* Premium menu polish — scoped to the public menu, not the back office. */
/* The category rail uses theme-native SVGs rather than fixed black/white bitmaps. */
.nexus-cats {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  background: hsl(var(--background) / .94);
  border-bottom: 1px solid var(--menu-border);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats .nexus-category-tab {
  min-height: 50px;
  min-width: max-content;
  gap: .6rem;
  padding: .42rem .95rem .42rem .45rem;
  letter-spacing: -.005em;
  font-weight: 700;
  font-size: .8rem;
  line-height: 1.2;
  box-shadow: none;
  -webkit-tap-highlight-color: transparent;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats .nexus-category-tab[aria-pressed="false"] {
  color: hsl(var(--foreground));
  background: color-mix(in srgb, hsl(var(--card)) 88%, hsl(var(--background)));
  border: 1px solid hsl(var(--foreground) / .12);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats .nexus-category-tab[aria-pressed="true"] {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  border: 1px solid hsl(var(--primary));
  box-shadow: 0 6px 18px hsl(var(--primary) / .18);
}
.nexus-category-icon {
  background: hsl(var(--primary) / .11);
  color: hsl(var(--primary));
  transition: background-color 180ms ease, color 180ms ease;
}
.nexus-category-tab[aria-pressed="true"] .nexus-category-icon {
  color: inherit;
  background: color-mix(in srgb, currentColor 17%, transparent);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats .nexus-category-tab:focus-visible,
.nexus-primary-action:focus-visible,
#menu-products article button:focus-visible,
.nexus-search-wrap:focus-within {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 3px;
}
.nexus-primary-action {
  color: hsl(var(--primary-foreground));
  font-weight: 750;
  -webkit-tap-highlight-color: transparent;
}
.nexus-primary-action:disabled { box-shadow: none; }
@media (hover: hover) and (pointer: fine) {
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats .nexus-category-tab[aria-pressed="false"]:hover {
    border-color: hsl(var(--primary) / .52);
    background: color-mix(in srgb, hsl(var(--primary)) 7%, hsl(var(--card)));
  }
  .nexus-primary-action:not(:disabled):hover {
    box-shadow: 0 8px 18px hsl(var(--primary) / .2);
  }
}

/* Six recognizable personalities, one consistent control system. */
.menu-template-minimal .nexus-cats { box-shadow: none; }
.menu-template-editorial .nexus-cats .nexus-category-tab { border-radius: .85rem; }
.menu-template-editorial .nexus-cats .nexus-category-tab[aria-pressed="false"] { background: #fffaf4; }
.menu-template-vibrant .nexus-cats .nexus-category-tab { border-radius: 1rem; }
.menu-template-luxury .nexus-cats .nexus-category-tab { letter-spacing: .01em; }
.menu-template-compact .nexus-cats .nexus-category-tab { border-radius: .75rem; }
.menu-template-compact .nexus-cats .nexus-category-icon { border-radius: .5rem; }

/* Functional-first product cards: clearer title, readable actions and refined focus. */
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products .nexus-card {
  border-width: 1px;
  transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products .nexus-card:focus-within {
  border-color: hsl(var(--primary) / .55);
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products .nexus-card h3 {
  font-size: clamp(.85rem, 1.15vw, 1.07rem);
  font-weight: 750;
  text-transform: none;
  letter-spacing: -.02em;
  line-height: 1.32;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products .nexus-card p {
  line-height: 1.5;
}
:is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products .nexus-card button:not(.nexus-fav) {
  min-height: 44px;
  font-size: .75rem;
  line-height: 1.15;
  font-weight: 750;
  letter-spacing: 0;
}
.menu-template-compact #menu-products .nexus-card h3 { font-size: clamp(.82rem, 1vw, .95rem); }
.menu-template-compact #menu-products .nexus-card button:not(.nexus-fav) { padding-inline: .75rem; }

/* Featured combo inherits merchant accent instead of always injecting orange. */
.nexus-featured-glow {
  background: radial-gradient(circle at 45% 48%, hsl(var(--primary) / .16), transparent 64%);
}
.nexus-featured-wordmark { color: hsl(var(--primary) / .13); }
.menu-template-luxury .nexus-featured-wordmark { color: rgba(184,149,85,.12); }

/* Small-screen comfort: swipeable categories and legible two-column cards. */
@media (max-width: 640px) {
  .nexus-cats {
    gap: .5rem;
    padding-bottom: .7rem;
    padding-top: .65rem;
  }
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) .nexus-cats .nexus-category-tab {
    min-height: 46px;
    padding: .35rem .8rem .35rem .36rem;
    font-size: .75rem;
  }
  .nexus-category-icon { width: 2rem; height: 2rem; }
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products .nexus-card > div:last-child {
    padding: .85rem;
  }
  :is(.menu-template-modern-dark, .menu-template-minimal, .menu-template-editorial, .menu-template-vibrant, .menu-template-luxury, .menu-template-compact) #menu-products .nexus-card button:not(.nexus-fav) {
    font-size: .74rem;
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .nexus-category-icon,
  .nexus-category-tab,
  .nexus-primary-action { transition: none !important; }
}

`;
