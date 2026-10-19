// src/lib/admin-auth.tsx
//
// Contexto de sessão do administrador da plataforma Nexus (dono/equipe
// interna) — usado só pela rota /painel-raiz. Totalmente separado do
// CustomerAuthProvider: usa o mesmo Supabase Auth por baixo, mas um
// contexto React próprio, para não misturar sessão de admin com sessão
// de cliente comum no mesmo navegador/aba.
//
// "isAdmin" só fica true depois de confirmar que o usuário logado consta
// na tabela platform_admins — logar com e-mail/senha válidos não basta.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AdminAuthContextValue = {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function checkAdmin(userId: string) {
    const { data } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    setIsAdmin(Boolean(data));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) {
        checkAdmin(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        checkAdmin(newSession.user.id);
      } else {
        setIsAdmin(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
  }

  return (
    <AdminAuthContext.Provider value={{ session, isAdmin, loading, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth precisa estar dentro de AdminAuthProvider');
  return ctx;
}
