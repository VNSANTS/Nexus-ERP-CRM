// src/lib/admin-auth.tsx
//
// A autorização administrativa é confirmada no banco para a sessão atual.
// Respostas atrasadas de uma sessão anterior não podem conceder acesso.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  const checkSequence = useRef(0);

  async function checkAdmin(userId: string, sequence: number) {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (sequence !== checkSequence.current) return;
    if (error) {
      console.error('Não foi possível verificar a permissão de administrador:', error);
      setIsAdmin(false);
      return;
    }
    setIsAdmin(Boolean(data));
  }

  useEffect(() => {
    // INITIAL_SESSION é entregue pelo próprio listener; não precisamos
    // disputar a inicialização com uma chamada paralela a getSession().
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const sequence = ++checkSequence.current;
      setSession(newSession);
      setIsAdmin(false);

      if (!newSession?.user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      // Consultas Supabase fora do callback de auth evitam reentrância no lock.
      window.setTimeout(() => {
        void checkAdmin(newSession.user.id, sequence).finally(() => {
          if (sequence === checkSequence.current) setLoading(false);
        });
      }, 0);
    });

    return () => {
      checkSequence.current++;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    checkSequence.current++;
    setSession(null);
    setIsAdmin(false);
    setLoading(false);
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
