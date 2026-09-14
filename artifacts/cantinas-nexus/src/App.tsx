import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Home } from './pages/Home';
import { Tracking } from './pages/Tracking';
import { Kitchen } from './pages/Kitchen';
import NotFound from './pages/not-found';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3000,
      retry: 2,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/acompanhar/:codigo" component={Tracking} />
      <Route path="/cozinha" component={Kitchen} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

export default App;
