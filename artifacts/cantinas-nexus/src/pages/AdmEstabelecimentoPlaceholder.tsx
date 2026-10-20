import { useLocation } from 'wouter';

// Placeholder temporário do painel ADM do estabelecimento (multi-tenant).
// O painel completo (cardápio, estoque, funcionários, pedidos, isolado
// por establishment_id) é construído em uma etapa futura — aqui só evita
// 404 ao clicar em "Acessar ADM" na tela final do onboarding.
export function AdmEstabelecimentoPlaceholder() {
  const [, navigate] = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm md:p-8">
        <h1 className="text-lg font-semibold text-neutral-900">Painel ADM</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Esta área ainda está em construção. Em breve você poderá gerenciar
          cardápio, estoque e funcionários por aqui.
        </p>
        <button
          type="button"
          onClick={() => navigate('/estabelecimento')}
          className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
