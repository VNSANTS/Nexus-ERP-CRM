import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Corrige a URL antes de renderizar, caso o usuário tenha chegado via o
// redirecionamento do 404.html (acesso direto ou reload numa rota da SPA,
// ex: /Nexus-ERP-CRM/cozinha). Ver public/404.html para o outro lado disso.
const redirectPath = sessionStorage.getItem('spa-redirect-path');
if (redirectPath) {
  sessionStorage.removeItem('spa-redirect-path');
  window.history.replaceState(null, '', redirectPath);
}

createRoot(document.getElementById('root')!).render(<App />);
