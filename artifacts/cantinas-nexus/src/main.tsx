import { createRoot } from 'react-dom/client';

import './index.css';

// Corrige a URL antes de renderizar, caso o usuário tenha chegado via o
// redirecionamento do 404.html (acesso direto ou reload numa rota da SPA,
// ex: /Nexus-ERP-CRM/cozinha). Ver public/404.html para o outro lado disso.
const redirectPath = sessionStorage.getItem('spa-redirect-path');
if (redirectPath) {
  sessionStorage.removeItem('spa-redirect-path');
  window.history.replaceState(null, '', redirectPath);
}

// O cliente Supabase pode consumir type=invite do hash ao inicializar. Guarda
// a finalidade antes do import para que o onboarding saiba pedir a senha.
const authCallbackParams = new URLSearchParams(
  `${window.location.search.replace(/^\?/, '')}&${window.location.hash.replace(/^#/, '')}`,
);
const authCallbackType = authCallbackParams.get('type');
if (authCallbackType) sessionStorage.setItem('nexus:auth-callback-type', authCallbackType);

// Importa o app e inicializa o Supabase apenas depois de restaurar a URL
// completa, incluindo os tokens e o tipo do convite vindos do 404.html.
void import('./App').then(({ default: App }) => {
  createRoot(document.getElementById('root')!).render(<App />);
});
