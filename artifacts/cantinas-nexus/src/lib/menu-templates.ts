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

`;
