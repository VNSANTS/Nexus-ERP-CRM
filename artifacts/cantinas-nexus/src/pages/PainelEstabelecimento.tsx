import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useOwnerAuth } from '../lib/owner-auth';

// Tela final depois do onboarding: dono vê acesso a tudo (Cardápio,
// Cozinha, ADM). Funcionários (login futuro, fora deste escopo) verão
// apenas os acessos liberados nas suas permissões.
export function PainelEstabelecimento() {
  const [, navigate] = useLocation();
  const { session, establishment, loading, signOut } = useOwnerAuth();

  useEffect(() => {
    if (loading) return;
    if (!session || !establishment) {
      navigate('/estabelecimento/login');
      return;
    }
    if (!establishment.onboardingCompleto) {
      navigate('/estabelecimento/onboarding');
    }
  }, [loading, session, establishment, navigate]);

  if (loading || !session || !establishment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm md:p-8">
        <h1 className="text-lg font-semibold text-neutral-900">{establishment.apelido}</h1>
        <p className="mt-1 text-sm text-neutral-500">Para onde você quer ir?</p>

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => navigate('/cardapio')}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Acessar Cardápio
          </button>
          <button
            type="button"
            onClick={() => navigate('/cozinha')}
            className="w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Acessar Cozinha
          </button>
          <button
            type="button"
            onClick={() => navigate('/cozinha')}
            className="w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Acessar ADM
          </button>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="mt-6 text-xs font-medium text-neutral-400 hover:text-neutral-700"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
