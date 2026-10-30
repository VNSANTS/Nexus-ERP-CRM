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
  access: Record<'acessoCozinha' | 'acessoCaixa' | 'acessoAdm' | 'acessoCrm' | 'acessoRelatorios' | 'acessoEstoque' | 'acessoFornecedores' | 'acessoProdutos' | 'acessoPromocoes' | 'acessoFuncionarios' | 'acessoConfiguracoes' | 'acessoDispositivos', boolean>;
};

type OwnerAuthContextValue = {
  session: Session | null;
  establishment: OwnerEstablishment | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  isAccountInvitation: boolean;
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
  const [isAccountInvitation, setIsAccountInvitation] = useState(false);
  const loadSequence = useRef(0);

  async function fetchEstablishment(): Promise<OwnerEstablishment | null> {
    // establishment_owners has RLS without client-side SELECT policies.
    // Use an authenticated function so only the establishment linked to
    // the current owner account is returned.
    const { data, error } = await supabase.functions.invoke('obter-estabelecimento-dono');
    if (error || data?.error) {
      throw error ?? new Error(data.error);
    }

    const est = data?.establishment;
    if (!est?.id) return null;
    return {
      id: est.id,
      nomeCompleto: est.nomeCompleto,
      apelido: est.apelido,
      email: est.email,
      cpfCnpj: est.cpfCnpj,
      onboardingCompleto: est.onboardingCompleto,
      access: data.access,
    };
  }

  async function refreshEstablishment() {
    if (session?.user?.id) {
      const sequence = ++loadSequence.current;
      setLoading(true);
      try {
        const loaded = await fetchEstablishment();
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
    const callbackType = recoveryParams.get('type') ?? sessionStorage.getItem('nexus:auth-callback-type');
    sessionStorage.removeItem('nexus:auth-callback-type');
    if (callbackType === 'recovery') setIsPasswordRecovery(true);
    if (callbackType === 'invite' || callbackType === 'signup' || callbackType === 'magiclink') {
      setIsAccountInvitation(true);
    }

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
        void fetchEstablishment()
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
      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
        setIsAccountInvitation(false);
      }
      syncSession(newSession);
    });

    return () => {
      loadSequence.current++;
      listener.subscription.unsubscribe();
    };
  }, []);

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false);
    setIsAccountInvitation(false);

    // A URL ainda pode conter o fragmento `type=recovery` depois que a
    // senha foi atualizada. Limpamos os tokens para que um reload nao
    // reapresente a tela de definicao de senha.
    const callbackUrl = new URL(window.location.href);
    callbackUrl.hash = '';
    for (const key of ['code', 'type', 'error', 'error_code', 'error_description']) {
      callbackUrl.searchParams.delete(key);
    }
    window.history.replaceState(null, document.title, `${callbackUrl.pathname}${callbackUrl.search}`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setEstablishment(null);
    setIsPasswordRecovery(false);
    setIsAccountInvitation(false);
    setLoading(false);
  }

  return (
    <OwnerAuthContext.Provider value={{ session, establishment, loading, isPasswordRecovery, isAccountInvitation, refreshEstablishment, clearPasswordRecovery, signOut }}>
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth(): OwnerAuthContextValue {
  const ctx = useContext(OwnerAuthContext);
  if (!ctx) throw new Error('useOwnerAuth precisa estar dentro de OwnerAuthProvider');
  return ctx;
}
