import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, ChefHat, LogOut, TabletSmartphone, UtensilsCrossed } from 'lucide-react';
import { useOwnerAuth } from '../lib/owner-auth';

export function PainelEstabelecimento() {
  const [, navigate] = useLocation();
  const { session, establishment, loading, signOut } = useOwnerAuth();

  useEffect(() => {
    if (loading) return;
    if (!session || !establishment) {
      navigate('/estabelecimento/login');
      return;
    }
    if (!establishment.onboardingCompleto) navigate('/estabelecimento/onboarding');
  }, [loading, session, establishment, navigate]);

  if (loading || !session || !establishment) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-sm text-muted-foreground">Carregando...</p></div>;
  }

  const areas = [
    { title: 'Administração e cozinha', detail: 'Pedidos, equipe, clientes, estoque e relatórios.', icon: ChefHat, href: '/cozinha', tone: 'bg-orange-500' },
    { title: 'Cardápio', detail: 'Acompanhe os itens disponíveis para os clientes.', icon: UtensilsCrossed, href: '/cardapio', tone: 'bg-emerald-600' },
    { title: 'Dispositivos', detail: 'Configure tablets e totens do cardápio.', icon: TabletSmartphone, href: '/estabelecimento/adm', tone: 'bg-slate-700' },
  ];

  return (
    <main className="nexus-noise min-h-screen bg-background px-4 py-10 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-600">Nexus · estabelecimento</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{establishment.apelido}</h1>
            <p className="mt-2 text-slate-500">Escolha uma área para continuar.</p>
          </div>
          <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sair</span>
          </button>
        </header>
        <section className="grid gap-4 md:grid-cols-3">
          {areas.map(({ title, detail, icon: Icon, href, tone }) => (
            <button key={href} type="button" onClick={() => navigate(href)} className="group flex min-h-56 flex-col rounded-3xl border border-border bg-card p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white ${tone}`}><Icon className="h-6 w-6" /></span>
              <span className="mt-6 text-xl font-black text-slate-900">{title}</span>
              <span className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">{detail}</span>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-orange-700">Abrir <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
