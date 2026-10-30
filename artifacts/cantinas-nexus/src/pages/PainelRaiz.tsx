import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Users, Clock3, ShieldCheck, RefreshCw, LogOut, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAdminAuth } from '../lib/admin-auth';
import { isValidCpfCnpj, formatCpfCnpj, isValidCep, formatCep, lookupCep } from '../lib/validators';
import { AcessosPlataforma } from './AcessosPlataforma';

// Campos como chegam do backend: toda resposta passa por camelizeKeys
// (_shared/helpers.ts), então snake_case do banco vira camelCase aqui.
type Solicitacao = {
  id: string;
  ownerNome: string;
  ownerEmail: string;
  ownerTelefone: string;
  ownerCpfCnpj: string;
  enderecoCep: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
  createdAt: string;
  establishmentId: string | null;
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'expirado';
  // Status do establishment vinculado, quando existe (null se a
  // solicitação nunca foi aprovada). Uma solicitação 'aprovada' cujo
  // establishment foi bloqueado depois continua com status 'aprovado'
  // aqui — é esse campo que mostra o bloqueio de verdade.
  establishmentStatus: string | null;
};

type StatusEfetivo = 'pendente' | 'aprovado' | 'bloqueado' | 'rejeitado' | 'expirado';

function statusEfetivo(s: Solicitacao): StatusEfetivo {
  if (s.status === 'aprovado' && s.establishmentStatus === 'bloqueado') return 'bloqueado';
  return s.status;
}

const STATUS_LABEL: Record<StatusEfetivo, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  bloqueado: 'Bloqueado',
  rejeitado: 'Rejeitado',
  expirado: 'Expirado',
};

const STATUS_COLOR: Record<StatusEfetivo, string> = {
  pendente: 'bg-amber-100 text-amber-700',
  aprovado: 'bg-emerald-100 text-emerald-700',
  bloqueado: 'bg-red-100 text-red-700',
  rejeitado: 'bg-neutral-200 text-neutral-600',
  expirado: 'bg-neutral-200 text-neutral-500',
};

function ResumoCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Building2; tone: 'orange' | 'amber' | 'green' | 'red' }) {
  const styles = {
    orange: 'bg-orange-100 text-orange-700',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
  }[tone];
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${styles}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-3 font-display text-3xl font-black text-foreground">{value}</p>
    </article>
  );
}

export function PainelRaiz() {
  const { session, isAdmin, loading, signOut } = useAdminAuth();
  const [secao, setSecao] = useState<'estabelecimentos' | 'usuarios' | 'acessos'>('estabelecimentos');

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

  if (secao === 'usuarios') {
    return <UsuariosPlataforma onBack={() => setSecao('estabelecimentos')} onSignOut={signOut} adminId={session.user.id} />;
  }
  if (secao === 'acessos') {
    return <AcessosPlataforma onBack={() => setSecao('estabelecimentos')} onSignOut={signOut} />;
  }
  return <AdminDashboard onSignOut={signOut} onUsers={() => setSecao('usuarios')} onAccess={() => setSecao('acessos')} adminId={session.user.id} />;
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

        <form onSubmit={handleLogin} className="mt-6 grid gap-4 xl:grid-cols-2">
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

function formatEndereco(s: Solicitacao): string {
  if (!s.enderecoCidade) return '—';
  const parts = [
    s.enderecoLogradouro,
    s.enderecoNumero && `, ${s.enderecoNumero}`,
    s.enderecoComplemento && ` - ${s.enderecoComplemento}`,
  ].filter(Boolean).join('');
  return `${parts} — ${s.enderecoBairro}, ${s.enderecoCidade}/${s.enderecoUf} (CEP ${s.enderecoCep})`;
}

// === Dashboard com as solicitações pendentes ===
function AdminDashboard({ onSignOut, onUsers, onAccess, adminId }: { onSignOut: () => void; onUsers: () => void; onAccess: () => void; adminId: string }) {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [detalhesDe, setDetalhesDe] = useState<Solicitacao | null>(null);
  const [editandoDe, setEditandoDe] = useState<Solicitacao | null>(null);
  const [confirmando, setConfirmando] = useState<{ id: string; action: 'reject' | 'block' | 'unblock' } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [excluindoEstabelecimentoId, setExcluindoEstabelecimentoId] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('listar-solicitacoes');
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? data?.message ?? 'Não foi possível carregar as solicitações.');
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

  async function excluirSolicitacao(s: Solicitacao) {
    if (s.status !== 'pendente' && s.status !== 'rejeitado') return;
    const descricao = s.status === 'pendente'
      ? 'Excluir esta solicitação pendente? Esta ação não pode ser desfeita.'
      : 'Excluir esta solicitação rejeitada do histórico? Esta ação não pode ser desfeita. O estabelecimento e os bloqueios existentes não serão apagados.';
    const confirmado = window.confirm(descricao);
    if (!confirmado) return;
    setExcluindoId(s.id);
    try {
      const { data, error } = await supabase.functions.invoke('decidir-solicitacao', {
        body: { action: 'delete', requestId: s.id },
      });
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? data?.message ?? 'Não foi possível excluir a solicitação.');
        return;
      }
      toast.success(data?.message ?? 'Solicitação excluída.');
      await carregar();
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao excluir a solicitação.');
    } finally {
      setExcluindoId(null);
    }
  }

  async function excluirEstabelecimento(s: Solicitacao) {
    if (s.status !== 'aprovado' || !s.establishmentId) return;
    if (!['ativo', 'bloqueado'].includes(s.establishmentStatus ?? '')) return;
    const confirmado = window.confirm(
      `Excluir permanentemente o estabelecimento de ${s.ownerNome}? Isso também remove os acessos vinculados, funcionários, dispositivos e a solicitação de aprovação. Identificadores já bloqueados continuam bloqueados. Pedidos e produtos sem vínculo com o estabelecimento serão preservados. Esta ação não pode ser desfeita.`,
    );
    if (!confirmado) return;

    setExcluindoEstabelecimentoId(s.id);
    try {
      const { data, error } = await supabase.functions.invoke('decidir-solicitacao', {
        body: { action: 'delete-establishment', requestId: s.id },
      });
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? data?.message ?? 'Não foi possível excluir o estabelecimento.');
        return;
      }
      toast.success(data?.message ?? 'Estabelecimento excluído.');
      await carregar();
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao excluir o estabelecimento.');
    } finally {
      setExcluindoEstabelecimentoId(null);
    }
  }

  async function aprovar(requestId: string) {
    setProcessandoId(requestId);
    try {
      const { data, error } = await supabase.functions.invoke('decidir-solicitacao', {
        body: { action: 'approve', requestId },
      });
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? data?.message ?? 'Não foi possível aprovar.');
        return;
      }
      toast.success(data?.message ?? 'Aprovado com sucesso.');
      await carregar();
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao aprovar.');
    } finally {
      setProcessandoId(null);
    }
  }

  async function reenviarConvite(s: Solicitacao) {
    if (s.status !== 'aprovado' || !s.establishmentId) return;
    setProcessandoId(s.id);
    try {
      const { data, error } = await supabase.functions.invoke('decidir-solicitacao', {
        body: { action: 'resend-setup-invite', requestId: s.id },
      });
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? data?.message ?? 'Não foi possível reenviar o link.');
        return;
      }
      toast.success(data?.message ?? 'Link para concluir cadastro enviado.');
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao reenviar o link.');
    } finally {
      setProcessandoId(null);
    }
  }

  async function confirmarAcao() {
    if (!confirmando) return;
    const { id, action } = confirmando;
    setProcessandoId(id);
    try {
      const { data, error } = await supabase.functions.invoke('decidir-solicitacao', {
        body: { action, requestId: id, reason: motivo.trim() || undefined },
      });
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? data?.message ?? 'Não foi possível processar.');
        return;
      }
      toast.success(data?.message ?? 'Processado com sucesso.');
      await carregar();
      setConfirmando(null);
      setMotivo('');
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado.');
    } finally {
      setProcessandoId(null);
    }
  }

  async function salvarEdicao(fields: Record<string, string>) {
    if (!editandoDe) return;
    setProcessandoId(editandoDe.id);
    try {
      const { data, error } = await supabase.functions.invoke('decidir-solicitacao', {
        body: { action: 'edit', requestId: editandoDe.id, fields },
      });
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? data?.message ?? 'Não foi possível salvar.');
        return;
      }
      toast.success('Solicitação atualizada.');
      setEditandoDe(null);
      await carregar();
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao salvar.');
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#172333] px-6 py-6 text-white shadow-xl sm:px-8">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Painel de estabelecimentos</h1>
          <div className="flex items-center gap-4">
            <button type="button" onClick={onUsers} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15">
              <Users className="h-4 w-4" />
              Usuários do sistema
            </button>
            <button type="button" onClick={onAccess} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15">
              <KeyRound className="h-4 w-4" />
              Acessos e permissões
            </button>
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
              {carregando ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ResumoCard label="Estabelecimentos" value={solicitacoes.filter((s) => ['aprovado', 'bloqueado'].includes(statusEfetivo(s))).length} icon={Building2} tone="orange" />
          <ResumoCard label="Aguardando análise" value={solicitacoes.filter((s) => s.status === 'pendente').length} icon={Clock3} tone="amber" />
          <ResumoCard label="Ativos" value={solicitacoes.filter((s) => statusEfetivo(s) === 'aprovado').length} icon={ShieldCheck} tone="green" />
          <ResumoCard label="Bloqueados" value={solicitacoes.filter((s) => statusEfetivo(s) === 'bloqueado').length} icon={Building2} tone="red" />
        </section>
        <div className="mb-3 mt-9 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Visão geral</p><h2 className="mt-1 font-display text-2xl font-extrabold text-foreground">Solicitações recentes</h2></div><span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground">{solicitacoes.length} registros</span></div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {carregando && <p className="col-span-full rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando...</p>}
          {!carregando && solicitacoes.length === 0 && (
            <p className="col-span-full rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
          )}

          {solicitacoes.map((s) => {
            const processando = processandoId === s.id || excluindoId === s.id || excluindoEstabelecimentoId === s.id;
            const efetivo = statusEfetivo(s);
            const ehPendente = s.status === 'pendente';
            const podeBloquear = efetivo === 'pendente' || efetivo === 'aprovado';
            return (
              <article key={s.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-neutral-900">{s.ownerNome}</p>
                    <p className="text-xs text-neutral-500">
                      {s.createdAt ? new Date(s.createdAt).toLocaleString('pt-BR') : '—'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[efetivo]}`}>
                    {STATUS_LABEL[efetivo]}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl bg-muted/70 p-3 text-sm text-neutral-700 md:grid-cols-2">
                  <p><span className="text-neutral-400">E-mail:</span> {s.ownerEmail}</p>
                  <p><span className="text-neutral-400">Telefone:</span> {s.ownerTelefone}</p>
                  <p><span className="text-neutral-400">CPF/CNPJ:</span> {s.ownerCpfCnpj}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  {ehPendente && (
                    <button
                      type="button"
                      disabled={processando}
                      onClick={() => aprovar(s.id)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Aprovar
                    </button>
                  )}
                  {ehPendente && (
                    <button
                      type="button"
                      disabled={processando}
                      onClick={() => { setConfirmando({ id: s.id, action: 'reject' }); setMotivo(''); }}
                      className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-300 disabled:opacity-60"
                    >
                      Rejeitar
                    </button>
                  )}
                  {podeBloquear && (
                    <button
                      type="button"
                      disabled={processando}
                      onClick={() => { setConfirmando({ id: s.id, action: 'block' }); setMotivo(''); }}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      Bloquear
                    </button>
                  )}
                  {efetivo === 'bloqueado' && (
                    <button
                      type="button"
                      disabled={processando}
                      onClick={() => { setConfirmando({ id: s.id, action: 'unblock' }); setMotivo(''); }}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Desbloquear
                    </button>
                  )}
                  {s.status === 'aprovado' && s.establishmentId && ['ativo', 'bloqueado'].includes(s.establishmentStatus ?? '') && (
                    <button
                      type="button"
                      disabled={processando}
                      onClick={() => reenviarConvite(s)}
                      className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                    >
                      {processandoId === s.id ? 'Enviando link...' : 'Reenviar convite'}
                    </button>
                  )}
                  {s.status === 'aprovado' && s.establishmentId && ['ativo', 'bloqueado'].includes(s.establishmentStatus ?? '') && (
                    <button
                      type="button"
                      disabled={processando}
                      onClick={() => excluirEstabelecimento(s)}
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {excluindoEstabelecimentoId === s.id ? 'Excluindo...' : 'Excluir estabelecimento'}
                    </button>
                  )}
                  {ehPendente && (
                    <button
                      type="button"
                      disabled={processando}
                      onClick={() => setEditandoDe(s)}
                      className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                    >
                      Editar
                    </button>
                  )}
                  {(s.status === 'pendente' || s.status === 'rejeitado') && (
                    <button
                      type="button"
                      disabled={processando || excluindoId === s.id}
                      onClick={() => excluirSolicitacao(s)}
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {excluindoId === s.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={processando}
                    onClick={() => setDetalhesDe(s)}
                    className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    Ver detalhes
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {detalhesDe && <DetalhesModal solicitacao={detalhesDe} onClose={() => setDetalhesDe(null)} />}
      {editandoDe && (
        <EditarModal
          solicitacao={editandoDe}
          salvando={processandoId === editandoDe.id}
          onClose={() => setEditandoDe(null)}
          onSalvar={salvarEdicao}
        />
      )}
      {confirmando && (
        <ConfirmarModal
          action={confirmando.action}
          motivo={motivo}
          setMotivo={setMotivo}
          processando={processandoId === confirmando.id}
          onCancel={() => { setConfirmando(null); setMotivo(''); }}
          onConfirm={confirmarAcao}
        />
      )}
    </div>
  );
}

// === Modal: ver detalhes ===
function DetalhesModal({ solicitacao, onClose }: { solicitacao: Solicitacao; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Detalhes da solicitação</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <Campo label="Nome" valor={solicitacao.ownerNome} />
          <Campo label="E-mail" valor={solicitacao.ownerEmail} />
          <Campo label="Telefone" valor={solicitacao.ownerTelefone} />
          <Campo label="CPF/CNPJ" valor={solicitacao.ownerCpfCnpj} />
          <Campo label="Endereço" valor={formatEndereco(solicitacao)} />
          <Campo
            label="Enviado em"
            valor={solicitacao.createdAt ? new Date(solicitacao.createdAt).toLocaleString('pt-BR') : '—'}
          />
          <Campo label="ID da solicitação" valor={solicitacao.id} mono />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

function Campo({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      <p className={mono ? 'font-mono text-xs text-neutral-700' : 'text-neutral-800'}>{valor}</p>
    </div>
  );
}

// === Modal: editar ===
function EditarModal({
  solicitacao,
  salvando,
  onClose,
  onSalvar,
}: {
  solicitacao: Solicitacao;
  salvando: boolean;
  onClose: () => void;
  onSalvar: (fields: Record<string, string>) => void;
}) {
  const [nome, setNome] = useState(solicitacao.ownerNome);
  const [telefone, setTelefone] = useState(solicitacao.ownerTelefone);
  const [cpfCnpj, setCpfCnpj] = useState(formatCpfCnpj(solicitacao.ownerCpfCnpj ?? ''));
  const [cep, setCep] = useState(formatCep(solicitacao.enderecoCep ?? ''));
  const [logradouro, setLogradouro] = useState(solicitacao.enderecoLogradouro ?? '');
  const [numero, setNumero] = useState(solicitacao.enderecoNumero ?? '');
  const [complemento, setComplemento] = useState(solicitacao.enderecoComplemento ?? '');
  const [bairro, setBairro] = useState(solicitacao.enderecoBairro ?? '');
  const [cidade, setCidade] = useState(solicitacao.enderecoCidade ?? '');
  const [uf, setUf] = useState(solicitacao.enderecoUf ?? '');
  const [cepLoading, setCepLoading] = useState(false);

  async function handleCepBlur() {
    const digits = cep.replace(/\D/g, '');
    if (!isValidCep(digits)) return;
    setCepLoading(true);
    const result = await lookupCep(digits);
    setCepLoading(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setLogradouro(result.logradouro);
    setBairro(result.bairro);
    setCidade(result.cidade);
    setUf(result.uf);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) {
      toast.error('Nome e telefone são obrigatórios.');
      return;
    }
    if (!isValidCpfCnpj(cpfCnpj)) {
      toast.error('CPF ou CNPJ inválido.');
      return;
    }
    onSalvar({
      nome: nome.trim(),
      telefone: telefone.trim(),
      cpfCnpj: cpfCnpj.trim(),
      enderecoCep: cep.trim(),
      enderecoLogradouro: logradouro.trim(),
      enderecoNumero: numero.trim(),
      enderecoComplemento: complemento.trim(),
      enderecoBairro: bairro.trim(),
      enderecoCidade: cidade.trim(),
      enderecoUf: uf.trim().toUpperCase(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Editar solicitação</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Telefone</label>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">CPF/CNPJ</label>
            <input value={cpfCnpj} onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
          </div>

          <div className="border-t border-neutral-200 pt-3">
            <p className="mb-2 text-xs font-semibold text-neutral-600">Endereço</p>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">CEP</label>
                <input value={cep} onChange={(e) => setCep(formatCep(e.target.value))} onBlur={handleCepBlur}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                {cepLoading && <p className="mt-1 text-xs text-neutral-400">Buscando...</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Logradouro</label>
                <input value={logradouro} onChange={(e) => setLogradouro(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Número</label>
                <input value={numero} onChange={(e) => setNumero(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Complemento</label>
                <input value={complemento} onChange={(e) => setComplemento(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_1fr_70px] gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Bairro</label>
                <input value={bairro} onChange={(e) => setBairro(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Cidade</label>
                <input value={cidade} onChange={(e) => setCidade(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">UF</label>
                <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} maxLength={2}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm uppercase" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60">
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// === Modal: confirmar rejeitar/bloquear/desbloquear ===
function ConfirmarModal({
  action,
  motivo,
  setMotivo,
  processando,
  onCancel,
  onConfirm,
}: {
  action: 'reject' | 'block' | 'unblock';
  motivo: string;
  setMotivo: (v: string) => void;
  processando: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isBlock = action === 'block';
  const isUnblock = action === 'unblock';
  const title = isUnblock
    ? 'Desbloquear estabelecimento'
    : isBlock
      ? 'Bloquear solicitação'
      : 'Rejeitar solicitação';
  const description = isUnblock
    ? 'O estabelecimento voltará a ficar ativo e o CPF/CNPJ e o e-mail serão liberados.'
    : isBlock
      ? 'O CPF/CNPJ e o e-mail não poderão solicitar novamente.'
      : 'O solicitante pode enviar uma nova solicitação depois.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>

        {!isUnblock && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-neutral-500">Motivo (opcional)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
            Cancelar
          </button>
          <button
            type="button"
            disabled={processando}
            onClick={onConfirm}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
              isBlock ? 'bg-red-600 hover:bg-red-700' : isUnblock ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-neutral-700 hover:bg-neutral-800'
            }`}
          >
            {processando ? 'Processando...' : isUnblock ? 'Desbloquear' : isBlock ? 'Bloquear' : 'Rejeitar'}
          </button>
        </div>
      </div>
    </div>
  );
}

type UsuarioPlataforma = { id: string; nome: string | null; email: string; telefone: string | null; cpf: string | null; cadastro_completo: boolean; created_at: string; is_platform_admin: boolean; is_super_admin: boolean };
type ResumoUsuarios = { total: number; completos: number; novos30Dias: number; pedidos30Dias: number };

function UsuariosPlataforma({ onBack, onSignOut, adminId }: { onBack: () => void; onSignOut: () => void; adminId: string }) {
  const [usuarios, setUsuarios] = useState<UsuarioPlataforma[]>([]);
  const [resumo, setResumo] = useState<ResumoUsuarios | null>(null);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    try {
      const [lista, dashboard] = await Promise.all([
        supabase.functions.invoke('gerenciar-usuarios-plataforma', { body: { action: 'list' } }),
        supabase.functions.invoke('gerenciar-usuarios-plataforma', { body: { action: 'dashboard' } }),
      ]);
      if (lista.error || lista.data?.error) throw lista.error ?? new Error(lista.data?.error);
      if (dashboard.error || dashboard.data?.error) throw dashboard.error ?? new Error(dashboard.data?.error);
      setUsuarios(lista.data ?? []);
      setResumo(dashboard.data);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar os usuários.');
    } finally { setCarregando(false); }
  }

  useEffect(() => { void carregar(); }, []);

  async function excluir(usuario: UsuarioPlataforma) {
    if (!window.confirm(`Excluir definitivamente a conta de ${usuario.nome || usuario.email}?`)) return;
    const { data, error } = await supabase.functions.invoke('gerenciar-usuarios-plataforma', { body: { action: 'delete', id: usuario.id } });
    if (error || data?.error) { toast.error(data?.error ?? 'Não foi possível excluir o usuário.'); return; }
    toast.success('Usuário excluído.');
    void carregar();
  }

  async function alternarSuperAdmin(usuario: UsuarioPlataforma) {
    const action = usuario.is_super_admin ? 'revoke-super-admin' : 'grant-super-admin';
    const confirmacao = usuario.is_super_admin
      ? `Remover o acesso de administrador superior de ${usuario.email}?`
      : `Conceder acesso de administrador superior a ${usuario.email}? Essa pessoa poderá promover outros administradores.`;
    if (!window.confirm(confirmacao)) return;
    const { data, error } = await supabase.functions.invoke('gerenciar-usuarios-plataforma', { body: { action, id: usuario.id } });
    if (error || data?.error) { toast.error(data?.error ?? 'Não foi possível alterar o acesso.'); return; }
    toast.success(usuario.is_super_admin ? 'Acesso superior removido.' : 'Acesso superior concedido.');
    void carregar();
  }

  const filtrados = usuarios.filter((u) => `${u.nome ?? ''} ${u.email} ${u.telefone ?? ''} ${u.cpf ?? ''}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#172333] px-6 py-6 text-white shadow-xl sm:px-8">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-white/60">Nexus Company · Plataforma</p><h1 className="mt-1 font-display text-2xl font-extrabold text-white sm:text-3xl">Usuários do sistema</h1><p className="mt-1 text-sm text-white/70">Acompanhe contas e níveis de acesso.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={onBack} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white">Estabelecimentos</button><button onClick={() => void carregar()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Atualizar</button><button onClick={onSignOut} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-white/75">Sair</button></div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[['Usuários cadastrados', resumo?.total ?? 0], ['Cadastros completos', resumo?.completos ?? 0], ['Novos em 30 dias', resumo?.novos30Dias ?? 0], ['Pedidos em 30 dias', resumo?.pedidos30Dias ?? 0]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-black text-foreground">{value}</p></div>)}
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Base de clientes</p><h2 className="mt-1 text-lg font-extrabold text-foreground">Contas de usuários finais</h2></div><div className="relative w-full md:w-80"><Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou telefone" className="w-full rounded-xl border border-border py-2 pl-9 pr-3 text-sm" /></div></div>
          {carregando ? <p className="py-8 text-sm text-neutral-400">Carregando...</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-neutral-400"><th className="px-3 py-3">Usuário</th><th className="px-3 py-3">Contato</th><th className="px-3 py-3">Acesso</th><th className="px-3 py-3">Cadastro</th><th className="px-3 py-3">Criado em</th><th className="px-3 py-3" /></tr></thead><tbody>{filtrados.map((u) => <tr key={u.id} className="border-b last:border-0"><td className="px-3 py-3"><p className="font-semibold">{u.nome || 'Sem nome'}</p><p className="text-xs text-neutral-500">{u.email}</p></td><td className="px-3 py-3">{u.telefone || '—'}</td><td className="px-3 py-3"><span className="text-xs font-semibold">{u.is_super_admin ? 'ADM superior' : u.is_platform_admin ? 'ADM da plataforma' : 'Usuário'}</span>{u.is_platform_admin && adminId !== u.id && <button onClick={() => void alternarSuperAdmin(u)} className="ml-2 text-xs font-semibold text-primary">{u.is_super_admin ? 'Remover superior' : 'Tornar superior'}</button>}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.cadastro_completo ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{u.cadastro_completo ? 'Completo' : 'Incompleto'}</span></td><td className="px-3 py-3 text-neutral-500">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td><td className="px-3 py-3 text-right">{u.id !== adminId && <button onClick={() => void excluir(u)} className="font-semibold text-red-600 hover:text-red-800">Excluir</button>}</td></tr>)}</tbody></table>{!filtrados.length && <p className="py-8 text-center text-sm text-neutral-400">Nenhum usuário encontrado.</p>}</div>}
        </div>
      </div>
    </div>
  );
}
