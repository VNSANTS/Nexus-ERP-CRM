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
.menu-hero-accent { background: var(--primary); }
.menu-template-modern-dark .menu-hero { background:linear-gradient(135deg,#151b24,#202b38); border-color:#354253; }
.menu-template-modern-dark .menu-hero h2,.menu-template-modern-dark .menu-hero p { color:#f8fafc; }
.menu-template-modern-dark .menu-hero p:not(.text-primary) { color:#cbd5e1; }
.menu-template-modern-dark .menu-qr { background:#18212c; border-color:#354253; }
.menu-template-modern-dark .menu-qr span { color:#f8fafc; }
.menu-template-modern-dark .menu-empty-feature { background:#18212c; border-color:#354253; }
.menu-template-minimal .menu-hero { border-radius:1rem; box-shadow:none; }
.menu-template-minimal .menu-hero-accent { display:none; }
.menu-template-editorial .menu-hero { border-radius:.75rem; background:#f8f1e8; border-color:#e8d9c8; }
.menu-template-editorial .menu-hero h2 { font-family:Georgia,serif; font-weight:500; letter-spacing:-.04em; }
.menu-template-editorial .menu-hero-accent { width:15rem; height:15rem; background:#a34f38; opacity:.10; }
.menu-template-editorial #menu-products > button { border-radius:.8rem; border-color:#e7d8c7; box-shadow:0 8px 24px rgba(80,50,30,.06); }
.menu-template-vibrant .menu-hero { border:0; border-radius:2rem; background:linear-gradient(120deg,#fff1f2,#fff7ed); }
.menu-template-vibrant .menu-hero-accent { background:#f43f5e; }
.menu-template-vibrant #menu-products > button { border-radius:1.5rem; border-color:#fecdd3; }
.menu-template-luxury .menu-hero { background:linear-gradient(135deg,#21191d,#30252b); border-color:rgba(184,149,85,.38); }
.menu-template-luxury .menu-hero h2,.menu-template-luxury .menu-hero p:not(.text-primary) { color:#f8f3e9; }
.menu-template-luxury .menu-hero p.text-primary { color:#d7b879; }
.menu-template-luxury .menu-qr { background:#30252b; border-color:rgba(184,149,85,.38); }
.menu-template-luxury .menu-qr span { color:#f8f3e9; }
.menu-template-luxury .menu-empty-feature { background:#21191d; border-color:rgba(184,149,85,.3); }
.menu-template-compact .menu-hero { padding:1.5rem; border-radius:1rem; }
.menu-template-compact .menu-hero h2 { font-size:clamp(1.8rem,5vw,3.2rem); }
.menu-template-compact #menu-products { gap:.75rem; }
.menu-template-compact #menu-products > button { border-radius:.9rem; padding:.5rem; }
.menu-template-modern-dark #menu-products > button { background:linear-gradient(160deg,#202b38,#151b24); border-color:#354253; }
.menu-template-luxury #menu-products > button { background:linear-gradient(160deg,#30272c,#1d181c); border-color:rgba(184,149,85,.3); }
.menu-template-modern-dark .menu-empty-feature { color:#f8fafc; }
.menu-template-luxury .menu-empty-feature { color:#f8f3e9; }
@media(min-width:1024px){.menu-template-compact #menu-products{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
@media(max-width:640px){.menu-hero{padding:1.35rem!important}.menu-qr{width:100%}}
`;
