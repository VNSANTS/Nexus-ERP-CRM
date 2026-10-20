// src/lib/owner-auth.tsx
//
// Contexto de sessão do dono de estabelecimento — usado nas rotas de
// onboarding e, futuramente, no painel ADM do estabelecimento. Separado
// do CustomerAuthProvider e do AdminAuthProvider: mesmo Supabase Auth por
// baixo, mas contexto próprio, para as três sessões não se misturarem no
// mesmo navegador.
//
// "establishment" só é preenchido depois de confirmar que o usuário
// logado consta em establishment_owners — logar com e-mail/senha válidos
// não basta, precisa ser dono de algum estabelecimento.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OwnerEstablishment = {
  id: string;
  nomeCompleto: string;
  apelido: string;
  email: string;
  cpfCnpj: string;
  onboardingCompleto: boolean;
};

type OwnerAuthContextValue = {
  session: Session | null;
  establishment: OwnerEstablishment | null;
  loading: boolean;
  refreshEstablishment: () => Promise<void>;
  signOut: () => Promise<void>;
};

const OwnerAuthContext = createContext<OwnerAuthContextValue | undefined>(undefined);

export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [establishment, setEstablishment] = useState<OwnerEstablishment | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadEstablishment(userId: string) {
    const { data: owner } = await supabase
      .from('establishment_owners')
      .select('establishment_id')
      .eq('id', userId)
      .maybeSingle();

    if (!owner) {
      setEstablishment(null);
      return;
    }

    const { data: est } = await supabase
      .from('establishments')
      .select('id, nome_completo, apelido, email, cpf_cnpj, onboarding_completo')
      .eq('id', owner.establishment_id)
      .maybeSingle();

    if (est) {
      setEstablishment({
        id: est.id,
        nomeCompleto: est.nome_completo,
        apelido: est.apelido,
        email: est.email,
        cpfCnpj: est.cpf_cnpj,
        onboardingCompleto: est.onboarding_completo,
      });
    } else {
      setEstablishment(null);
    }
  }

  async function refreshEstablishment() {
    if (session?.user?.id) {
      await loadEstablishment(session.user.id);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) {
        loadEstablishment(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        loadEstablishment(newSession.user.id);
      } else {
        setEstablishment(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setEstablishment(null);
  }

  return (
    <OwnerAuthContext.Provider value={{ session, establishment, loading, refreshEstablishment, signOut }}>
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth(): OwnerAuthContextValue {
  const ctx = useContext(OwnerAuthContext);
  if (!ctx) throw new Error('useOwnerAuth precisa estar dentro de OwnerAuthProvider');
  return ctx;
}
