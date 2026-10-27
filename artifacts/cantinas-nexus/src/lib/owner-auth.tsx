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

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  isPasswordRecovery: boolean;
  refreshEstablishment: () => Promise<void>;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

const OwnerAuthContext = createContext<OwnerAuthContextValue | undefined>(undefined);

export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [establishment, setEstablishment] = useState<OwnerEstablishment | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const loadSequence = useRef(0);

  async function fetchEstablishment(userId: string): Promise<OwnerEstablishment | null> {
    const { data: owner } = await supabase
      .from('establishment_owners')
      .select('establishment_id')
      .eq('id', userId)
      .maybeSingle();

    if (!owner) return null;

    const { data: est } = await supabase
      .from('establishments')
      .select('id, nome_completo, apelido, email, cpf_cnpj, onboarding_completo')
      .eq('id', owner.establishment_id)
      .maybeSingle();

    if (est) {
      return {
        id: est.id,
        nomeCompleto: est.nome_completo,
        apelido: est.apelido,
        email: est.email,
        cpfCnpj: est.cpf_cnpj,
        onboardingCompleto: est.onboarding_completo,
      };
    }
    return null;
  }

  async function refreshEstablishment() {
    if (session?.user?.id) {
      const sequence = ++loadSequence.current;
      setLoading(true);
      try {
        const loaded = await fetchEstablishment(session.user.id);
        if (sequence === loadSequence.current) setEstablishment(loaded);
      } finally {
        if (sequence === loadSequence.current) setLoading(false);
      }
    }
  }

  useEffect(() => {
    const recoveryParams = new URLSearchParams(
      `${window.location.search.replace(/^\?/, '')}&${window.location.hash.replace(/^#/, '')}`,
    );
    if (recoveryParams.get('type') === 'recovery') setIsPasswordRecovery(true);

    const syncSession = (newSession: Session | null) => {
      const sequence = ++loadSequence.current;
      setSession(newSession);
      if (!newSession?.user?.id) {
        setEstablishment(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      // Defer Supabase data calls until the auth callback has returned.
      window.setTimeout(() => {
        void fetchEstablishment(newSession.user.id)
          .then((loaded) => {
            if (sequence === loadSequence.current) setEstablishment(loaded);
          })
          .catch((error) => {
            console.error('Não foi possível carregar o estabelecimento do dono:', error);
            if (sequence === loadSequence.current) setEstablishment(null);
          })
          .finally(() => {
            if (sequence === loadSequence.current) setLoading(false);
          });
      }, 0);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
      syncSession(newSession);
    });

    return () => {
      loadSequence.current++;
      listener.subscription.unsubscribe();
    };
  }, []);

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setEstablishment(null);
    setIsPasswordRecovery(false);
    setLoading(false);
  }

  return (
    <OwnerAuthContext.Provider value={{ session, establishment, loading, isPasswordRecovery, refreshEstablishment, clearPasswordRecovery, signOut }}>
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth(): OwnerAuthContextValue {
  const ctx = useContext(OwnerAuthContext);
  if (!ctx) throw new Error('useOwnerAuth precisa estar dentro de OwnerAuthProvider');
  return ctx;
}
