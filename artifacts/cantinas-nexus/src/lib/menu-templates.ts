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
`;
