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
.menu-template-modern-dark .starnexus-hero { background:#101116; }
.menu-template-minimal .starnexus-hero { min-height:360px!important; background:#fff!important; color:#263238!important; border:1px solid #e5e7eb!important; box-shadow:0 18px 55px rgba(15,23,42,.07)!important; }
.menu-template-minimal .starnexus-hero [class*=text-white] { color:#263238!important; }
.menu-template-minimal .starnexus-hero [class*=text-orange] { color:#64748b!important; }
.menu-template-minimal .starnexus-hero [class*=border-white] { border-color:#e5e7eb!important; }
.menu-template-minimal .starnexus-hero [class*=bg-\\[\\#101116\\]] { background:#fff!important; }
.menu-template-minimal .starnexus-hero button { background:#263238!important; color:#fff!important; }
.menu-template-minimal .starnexus-hero .starnexus-outline { -webkit-text-stroke:1px #94a3b8; }
.menu-template-minimal #menu-products > button { border-radius:1rem!important; box-shadow:0 8px 24px rgba(15,23,42,.05)!important; }
.menu-template-editorial .starnexus-hero { min-height:470px!important; background:linear-gradient(115deg,#38271f 0%,#654536 62%,#a36a4c 100%)!important; border:0!important; border-radius:1rem!important; }
.menu-template-editorial .starnexus-hero h2 { font-family:Georgia,serif!important; font-weight:500!important; text-transform:none!important; letter-spacing:-.06em!important; }
.menu-template-editorial .starnexus-hero .starnexus-outline { -webkit-text-stroke:1px rgba(255,239,220,.75); }
.menu-template-editorial #menu-products { grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem!important; }
.menu-template-editorial #menu-products > button { border-radius:.8rem!important; border-color:#e7d8c7!important; box-shadow:0 12px 28px rgba(80,50,30,.08)!important; }
.menu-template-editorial #menu-products > button > div:first-of-type { aspect-ratio:1/1!important; }
.menu-template-vibrant .starnexus-hero { background:linear-gradient(125deg,#be123c 0%,#f43f5e 48%,#fb923c 100%)!important; border:0!important; border-radius:2.5rem!important; }
.menu-template-vibrant .starnexus-hero button { background:#fff!important; color:#be123c!important; }
.menu-template-vibrant #menu-products { grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem!important; }
.menu-template-vibrant #menu-products > button { border:2px solid #fecdd3!important; border-radius:2rem!important; box-shadow:0 12px 28px rgba(244,63,94,.10)!important; }
.menu-template-vibrant #menu-products > button > div:first-of-type { aspect-ratio:1/1!important; border-radius:1.5rem!important; }
.menu-template-luxury .starnexus-hero { background:radial-gradient(ellipse at 80% 15%,#493528 0%,#21191d 42%,#171316 78%)!important; border:1px solid rgba(184,149,85,.38)!important; border-radius:1.2rem!important; }
.menu-template-luxury .starnexus-hero [class*=text-orange] { color:#d7b879!important; }
.menu-template-luxury .starnexus-hero button { background:#b89555!important; color:#171316!important; }
.menu-template-luxury #menu-products { grid-template-columns:repeat(2,minmax(0,1fr)); gap:1.25rem!important; }
.menu-template-luxury #menu-products > button { border-color:rgba(184,149,85,.3)!important; border-radius:1rem!important; box-shadow:0 18px 42px rgba(0,0,0,.18)!important; }
.menu-template-luxury #menu-products > button > div:first-of-type { aspect-ratio:1/1!important; background:#282126!important; }
.menu-template-compact .starnexus-hero { min-height:300px!important; border-radius:1.25rem!important; background:linear-gradient(115deg,#172554,#1d4ed8 58%,#60a5fa)!important; }
.menu-template-compact .starnexus-hero > div:last-child { min-height:300px!important; }
.menu-template-compact .starnexus-hero h2 { font-size:clamp(2.8rem,7vw,5.2rem)!important; }
.menu-template-compact .starnexus-hero [class*=text-white] { color:#fff!important; }
.menu-template-compact #menu-products { grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem!important; }
.menu-template-compact #menu-products > button { border-radius:.9rem!important; padding:.5rem!important; }
@media(min-width:1024px){.menu-template-compact #menu-products{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
@media(max-width:640px){.menu-template-minimal .starnexus-hero{min-height:390px!important}.menu-template-editorial .starnexus-hero{min-height:440px!important}.menu-template-compact .starnexus-hero{min-height:340px!important}.menu-template-compact .starnexus-hero>div:last-child{min-height:340px!important}}
`;
