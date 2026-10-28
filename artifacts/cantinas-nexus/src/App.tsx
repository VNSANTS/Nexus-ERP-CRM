import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useEffect, type ReactNode } from 'react';
import { Home } from './pages/Home';
import { Tracking } from './pages/Tracking';
import { Kitchen } from './pages/Kitchen';
import { SolicitarEstabelecimento } from './pages/SolicitarEstabelecimento';
import { Login } from './pages/Login';
import { CompletarCadastro } from './pages/CompletarCadastro';
import { SelecionarEstabelecimento } from './pages/SelecionarEstabelecimento';
import { PainelRaiz } from './pages/PainelRaiz';
import { OnboardingEstabelecimento } from './pages/OnboardingEstabelecimento';
import { PainelEstabelecimento } from './pages/PainelEstabelecimento';
import { AdmEstabelecimentoPlaceholder } from './pages/AdmEstabelecimentoPlaceholder';
import { CardapioTablet } from './pages/CardapioTablet';
import NotFound from './pages/not-found';
import { Toaster } from 'sonner';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { CustomerAuthProvider, useCustomerAuth } from './lib/customer-auth';
import { AdminAuthProvider } from './lib/admin-auth';
import { OwnerAuthProvider, useOwnerAuth } from './lib/owner-auth';

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
      <Route path="/">{() => <Login />}</Route>
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
      <Route path="/cardapio-tablet" component={CardapioTablet} />
      <Route path="/nxs" component={PainelRaiz} />
      <Route path="/estabelecimento/login">{() => <Login />}</Route>
      <Route path="/estabelecimento/onboarding" component={OnboardingEstabelecimento} />
      <Route path="/estabelecimento/adm" component={AdmEstabelecimentoPlaceholder} />
      <Route path="/estabelecimento" component={PainelEstabelecimento} />
      <Route path="/solicitar-estabelecimento" component={SolicitarEstabelecimento} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RecoveryRedirect() {
  const [, navigate] = useLocation();
  const { isPasswordRecovery } = useOwnerAuth();

  useEffect(() => {
    if (isPasswordRecovery) navigate('/estabelecimento/onboarding');
  }, [isPasswordRecovery, navigate]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CustomerAuthProvider>
        <AdminAuthProvider>
          <OwnerAuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <RecoveryRedirect />
              <Router />
            </WouterRouter>
            <Toaster position="top-center" />
          </OwnerAuthProvider>
        </AdminAuthProvider>
      </CustomerAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
