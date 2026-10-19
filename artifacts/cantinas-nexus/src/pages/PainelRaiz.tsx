import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAdminAuth } from '../lib/admin-auth';

type Solicitacao = {
  id: string;
  owner_nome: string;
  owner_email: string;
  owner_telefone: string;
  owner_cpf_cnpj: string;
  endereco_cep: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_uf: string | null;
  created_at: string;
};

export function PainelRaiz() {
  const { session, isAdmin, loading, signOut } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Carregando...</p>
      </div>
    );
  }

  if (!session || !isAdmin) {
    return <AdminLogin deniedAccess={Boolean(session) && !isAdmin} />;
  }

  return <AdminDashboard onSignOut={signOut} />;
}

// === Tela de login do admin ===
function AdminLogin({ deniedAccess }: { deniedAccess: boolean }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });
      if (error) {
        toast.error('E-mail ou senha incorretos.');
        return;
      }
      // onAuthStateChange no AdminAuthProvider cuida do resto
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-center text-lg font-semibold text-neutral-900">Acesso restrito</h1>

        {deniedAccess && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            Sua conta não tem permissão de administrador.
          </p>
        )}

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// === Dashboard com as solicitações pendentes ===
function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('listar-solicitacoes-pendentes');
      if (error || data?.error) {
        toast.error(data?.error ?? 'Não foi possível carregar as solicitações.');
        return;
      }
      setSolicitacoes(data?.solicitacoes ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar solicitações.');
    } finally {
      setCarregando(false);
    }
  }

  async function decidir(requestId: string, action: 'approve' | 'reject' | 'block') {
    let reason: string | undefined;
    if (action === 'reject' || action === 'block') {
      const input = window.prompt(
        action === 'block'
          ? 'Motivo do bloqueio (opcional):'
          : 'Motivo da rejeição (opcional):',
      );
      if (input === null) return; // cancelou o prompt
      reason = input.trim() || undefined;
    } else {
      const confirmar = window.confirm('Aprovar esta solicitação e criar o estabelecimento?');
      if (!confirmar) return;
    }

    setProcessandoId(requestId);
    try {
      const { data, error } = await supabase.functions.invoke('decidir-solicitacao', {
        body: { action, requestId, reason },
      });
      if (error || data?.error) {
        toast.error(data?.error ?? 'Não foi possível processar a solicitação.');
        return;
      }
      toast.success(data?.message ?? 'Processado com sucesso.');
      setSolicitacoes((prev) => prev.filter((s) => s.id !== requestId));
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao processar.');
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Solicitações pendentes</h1>
          <button
            type="button"
            onClick={onSignOut}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
          >
            Sair
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {carregando && <p className="text-sm text-neutral-400">Carregando...</p>}
          {!carregando && solicitacoes.length === 0 && (
            <p className="text-sm text-neutral-400">Nenhuma solicitação pendente.</p>
          )}

          {solicitacoes.map((s) => {
            const processando = processandoId === s.id;
            return (
              <div key={s.id} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-neutral-900">{s.owner_nome}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(s.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-neutral-700 md:grid-cols-2">
                  <p><span className="text-neutral-400">E-mail:</span> {s.owner_email}</p>
                  <p><span className="text-neutral-400">Telefone:</span> {s.owner_telefone}</p>
                  <p><span className="text-neutral-400">CPF/CNPJ:</span> {s.owner_cpf_cnpj}</p>
                  {s.endereco_cidade && (
                    <p>
                      <span className="text-neutral-400">Endereço:</span>{' '}
                      {s.endereco_logradouro}, {s.endereco_numero}
                      {s.endereco_complemento ? ` - ${s.endereco_complemento}` : ''} —{' '}
                      {s.endereco_bairro}, {s.endereco_cidade}/{s.endereco_uf} (CEP {s.endereco_cep})
                    </p>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={processando}
                    onClick={() => decidir(s.id, 'approve')}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={processando}
                    onClick={() => decidir(s.id, 'reject')}
                    className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-300 disabled:opacity-60"
                  >
                    Rejeitar
                  </button>
                  <button
                    type="button"
                    disabled={processando}
                    onClick={() => decidir(s.id, 'block')}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Bloquear
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
