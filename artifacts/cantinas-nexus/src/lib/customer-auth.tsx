// src/lib/customer-auth.tsx
//
// Contexto de sessão do cliente final (não confundir com o login da
// cozinha/funcionário, que é outro sistema). Envolve o app inteiro e
// expõe a sessão atual do Supabase Auth + o registro em `customers`
// (para saber se o cadastro já foi completado).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type CustomerProfile = {
  id: string;
  nome: string | null;
  email: string;
  telefone: string | null;
  telefoneWhatsapp: boolean;
  cpf: string | null;
  cadastroCompleto: boolean;
};

type CustomerAuthContextValue = {
  session: Session | null;
  profile: CustomerProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('customers')
      .select('id, nome, email, telefone, telefone_whatsapp, cpf, cadastro_completo')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      setProfile({
        id: data.id,
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        telefoneWhatsapp: data.telefone_whatsapp,
        cpf: data.cpf,
        cadastroCompleto: data.cadastro_completo,
      });
    } else {
      setProfile(null);
    }
  }

  async function refreshProfile() {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  return (
    <CustomerAuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth precisa estar dentro de CustomerAuthProvider');
  return ctx;
}
