import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { CustomerAuthProvider, useCustomerAuth } from './lib/customer-auth';
import { AdminAuthProvider } from './lib/admin-auth';
import { OwnerAuthProvider, useOwnerAuth } from './lib/owner-auth';

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Tracking = lazy(() => import('./pages/Tracking').then((module) => ({ default: module.Tracking })));
const Kitchen = lazy(() => import('./pages/Kitchen').then((module) => ({ default: module.Kitchen })));
const SolicitarEstabelecimento = lazy(() => import('./pages/SolicitarEstabelecimento').then((module) => ({ default: module.SolicitarEstabelecimento })));
const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const CompletarCadastro = lazy(() => import('./pages/CompletarCadastro').then((module) => ({ default: module.CompletarCadastro })));
const SelecionarEstabelecimento = lazy(() => import('./pages/SelecionarEstabelecimento').then((module) => ({ default: module.SelecionarEstabelecimento })));
const PainelRaiz = lazy(() => import('./pages/PainelRaiz').then((module) => ({ default: module.PainelRaiz })));
const OnboardingEstabelecimento = lazy(() => import('./pages/OnboardingEstabelecimento').then((module) => ({ default: module.OnboardingEstabelecimento })));
const PainelEstabelecimento = lazy(() => import('./pages/PainelEstabelecimento').then((module) => ({ default: module.PainelEstabelecimento })));
const AdmEstabelecimentoPlaceholder = lazy(() => import('./pages/AdmEstabelecimentoPlaceholder').then((module) => ({ default: module.AdmEstabelecimentoPlaceholder })));
const CardapioTablet = lazy(() => import('./pages/CardapioTablet').then((module) => ({ default: module.CardapioTablet })));
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha').then((module) => ({ default: module.RedefinirSenha })));
const NotFound = lazy(() => import('./pages/not-found'));

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
  const { session } = useCustomerAuth();
  useEffect(() => {
    sessionStorage.setItem('nexus:establishmentId', params.establishmentId);
    if (session) sessionStorage.removeItem('nexus:pendingEstablishmentId');
    else sessionStorage.setItem('nexus:pendingEstablishmentId', params.establishmentId);
    navigate('/cardapio');
  }, [params.establishmentId, session, navigate]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <Login />}</Route>
      <Route path="/completar-cadastro" component={CompletarCadastro} />
      <Route path="/redefinir-senha" component={RedefinirSenha} />
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
      <Route path="/estabelecimento/login">{() => <Login ownerMode />}</Route>
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
  const { isPasswordRecovery, isAccountInvitation, loading, establishment } = useOwnerAuth();

  useEffect(() => {
    if (isAccountInvitation) {
      navigate('/estabelecimento/onboarding');
      return;
    }
    if (!isPasswordRecovery || loading) return;
    navigate(establishment ? '/estabelecimento/onboarding' : '/redefinir-senha');
  }, [isPasswordRecovery, isAccountInvitation, loading, establishment, navigate]);

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
              <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Carregando...</div>}>
                <Router />
              </Suspense>
            </WouterRouter>
            <Toaster position="top-center" />
          </OwnerAuthProvider>
        </AdminAuthProvider>
      </CustomerAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
