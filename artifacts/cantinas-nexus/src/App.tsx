import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useEffect, type ReactNode } from 'react';
import { Home } from './pages/Home';
import { Tracking } from './pages/Tracking';
import { Kitchen } from './pages/Kitchen';
import { SolicitarEstabelecimento } from './pages/SolicitarEstabelecimento';
import { Login } from './pages/Login';
import { CompletarCadastro } from './pages/CompletarCadastro';
import { SelecionarEstabelecimento } from './pages/SelecionarEstabelecimento';
import NotFound from './pages/not-found';
import { Toaster } from 'sonner';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { CustomerAuthProvider, useCustomerAuth } from './lib/customer-auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3000,
      retry: 2,
    },
  },
});

// Rotas que exigem cliente logado. Cozinha (/cozinha) tem seu próprio
// sistema de auth (funcionário) e não passa por aqui.
function RequireCustomer({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const { session, loading } = useCustomerAuth();

  useEffect(() => {
    if (!loading && !session) {
      navigate('/');
    }
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Carregando...</p>
      </div>
    );
  }
  if (!session) return null;

  return <>{children}</>;
}

// Rota /e/:id — abre o cardápio de um estabelecimento específico. Por
// enquanto redireciona para /cardapio (o totem ainda não filtra por
// establishment_id — isso entra quando os dados existentes forem
// migrados para o estabelecimento nº1, ver seção 6 do .md do projeto).
function AbrirEstabelecimento({ params }: { params: { establishmentId: string } }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    sessionStorage.setItem('nexus:establishmentId', params.establishmentId);
    navigate('/cardapio');
  }, [params.establishmentId, navigate]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/completar-cadastro" component={CompletarCadastro} />
      <Route path="/estabelecimentos">
        {() => (
          <RequireCustomer>
            <SelecionarEstabelecimento />
          </RequireCustomer>
        )}
      </Route>
      <Route path="/e/:establishmentId" component={AbrirEstabelecimento} />
      <Route path="/cardapio">
        {() => (
          <RequireCustomer>
            <Home />
          </RequireCustomer>
        )}
      </Route>
      <Route path="/acompanhar/:codigo">
        {() => (
          <RequireCustomer>
            <Tracking />
          </RequireCustomer>
        )}
      </Route>
      <Route path="/cozinha" component={Kitchen} />
      <Route path="/solicitar-estabelecimento" component={SolicitarEstabelecimento} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CustomerAuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster position="top-center" />
      </CustomerAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
