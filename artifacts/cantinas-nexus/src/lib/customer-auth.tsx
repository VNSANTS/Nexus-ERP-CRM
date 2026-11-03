// src/lib/customer-auth.tsx
//
// Sessão do cliente final. O estado do perfil acompanha a sessão atual:
// respostas antigas nunca podem restaurar o perfil de uma conta anterior.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  const loadSequence = useRef(0);

  async function loadProfile(userId: string, sequence: number) {
    const { data, error } = await supabase
      .from('customer_accounts')
      .select('id, nome, email, telefone, telefone_whatsapp, cpf, cadastro_completo')
      .eq('id', userId)
      .maybeSingle();

    if (sequence !== loadSequence.current) return;
    if (error) {
      console.error('Não foi possível carregar o perfil do cliente:', error);
      setProfile(null);
      return;
    }

    setProfile(data ? {
      id: data.id,
      nome: data.nome,
      email: data.email,
      telefone: data.telefone,
      telefoneWhatsapp: data.telefone_whatsapp,
      cpf: data.cpf,
      cadastroCompleto: data.cadastro_completo,
    } : null);
  }

  async function refreshProfile() {
    const userId = session?.user?.id;
    if (!userId) return;
    const sequence = ++loadSequence.current;
    await loadProfile(userId, sequence);
  }

  useEffect(() => {
    // INITIAL_SESSION também é emitido ao assinar o listener. Usar uma única
    // fonte evita a corrida entre getSession() e onAuthStateChange().
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const sequence = ++loadSequence.current;
      setSession(newSession);
      setProfile(null);

      if (!newSession?.user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      // Não chamar Supabase novamente dentro do callback de auth: isso pode
      // bloquear o lock interno do cliente. Agendamos a leitura após o callback.
      window.setTimeout(() => {
        void loadProfile(newSession.user.id, sequence).finally(() => {
          if (sequence === loadSequence.current) setLoading(false);
        });
      }, 0);
    });

    return () => {
      loadSequence.current++;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    // O listener também limpa o estado; invalidar a sequência protege contra
    // qualquer leitura de perfil que ainda esteja em andamento.
    loadSequence.current++;
    setSession(null);
    setProfile(null);
    setLoading(false);
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
