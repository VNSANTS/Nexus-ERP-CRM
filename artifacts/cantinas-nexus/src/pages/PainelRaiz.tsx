import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAdminAuth } from '../lib/admin-auth';
import { isValidCpfCnpj, formatCpfCnpj, isValidCep, formatCep, lookupCep } from '../lib/validators';

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
function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [secao, setSecao] = useState<'estabelecimentos' | 'usuarios'>('estabelecimentos');
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [detalhesDe, setDetalhesDe] = useState<Solicitacao | null>(null);
  const [editandoDe, setEditandoDe] = useState<Solicitacao | null>(null);
  const [confirmando, setConfirmando] = useState<{ id: string; action: 'reject' | 'block' | 'unblock' } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [excluindoEstabelecimentoId, setExcluindoEstabelecimentoId] = useState<string | null>(null);

  if (secao === 'usuarios') {
    return <UsuariosPlataforma onBack={() => setSecao('estabelecimentos')} onSignOut={onSignOut} />;
  }

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
    <div className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Solicitações de estabelecimento</h1>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setSecao('usuarios')} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
              Usuários do sistema
            </button>
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-800 disabled:opacity-60"
            >
              {carregando ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {carregando && <p className="text-sm text-neutral-400">Carregando...</p>}
          {!carregando && solicitacoes.length === 0 && (
            <p className="text-sm text-neutral-400">Nenhuma solicitação pendente.</p>
          )}

          {solicitacoes.map((s) => {
            const processando = processandoId === s.id || excluindoId === s.id || excluindoEstabelecimentoId === s.id;
            const efetivo = statusEfetivo(s);
            const ehPendente = s.status === 'pendente';
            const podeBloquear = efetivo === 'pendente' || efetivo === 'aprovado';
            return (
              <div key={s.id} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-neutral-900">{s.ownerNome}</p>
                    <p className="text-xs text-neutral-500">
                      {s.createdAt ? new Date(s.createdAt).toLocaleString('pt-BR') : '—'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[efetivo]}`}>
                    {STATUS_LABEL[efetivo]}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-neutral-700 md:grid-cols-2">
                  <p><span className="text-neutral-400">E-mail:</span> {s.ownerEmail}</p>
                  <p><span className="text-neutral-400">Telefone:</span> {s.ownerTelefone}</p>
                  <p><span className="text-neutral-400">CPF/CNPJ:</span> {s.ownerCpfCnpj}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
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
              </div>
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

type UsuarioPlataforma = { id: string; nome: string | null; email: string; telefone: string | null; cpf: string | null; cadastro_completo: boolean; created_at: string };
type ResumoUsuarios = { total: number; completos: number; novos30Dias: number; pedidos30Dias: number };

function UsuariosPlataforma({ onBack, onSignOut }: { onBack: () => void; onSignOut: () => void }) {
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

  const filtrados = usuarios.filter((u) => `${u.nome ?? ''} ${u.email} ${u.telefone ?? ''} ${u.cpf ?? ''}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-neutral-500">Administração Nexus</p><h1 className="text-2xl font-bold text-neutral-900">Usuários do sistema</h1></div>
          <div className="flex gap-2"><button onClick={onBack} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold">Estabelecimentos</button><button onClick={() => void carregar()} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold">Atualizar</button><button onClick={onSignOut} className="rounded-lg px-3 py-2 text-sm font-semibold text-neutral-500">Sair</button></div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[['Usuários cadastrados', resumo?.total ?? 0], ['Cadastros completos', resumo?.completos ?? 0], ['Novos em 30 dias', resumo?.novos30Dias ?? 0], ['Pedidos em 30 dias', resumo?.pedidos30Dias ?? 0]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-neutral-400">{label}</p><p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p></div>)}
        </div>
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-neutral-900">Contas de usuários finais</h2><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou telefone" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm md:w-80" /></div>
          {carregando ? <p className="py-8 text-sm text-neutral-400">Carregando...</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-neutral-400"><th className="px-3 py-3">Usuário</th><th className="px-3 py-3">Contato</th><th className="px-3 py-3">Cadastro</th><th className="px-3 py-3">Criado em</th><th className="px-3 py-3" /></tr></thead><tbody>{filtrados.map((u) => <tr key={u.id} className="border-b last:border-0"><td className="px-3 py-3"><p className="font-semibold">{u.nome || 'Sem nome'}</p><p className="text-xs text-neutral-500">{u.email}</p></td><td className="px-3 py-3">{u.telefone || '—'}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.cadastro_completo ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{u.cadastro_completo ? 'Completo' : 'Incompleto'}</span></td><td className="px-3 py-3 text-neutral-500">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td><td className="px-3 py-3 text-right"><button onClick={() => void excluir(u)} className="font-semibold text-red-600 hover:text-red-800">Excluir</button></td></tr>)}</tbody></table>{!filtrados.length && <p className="py-8 text-center text-sm text-neutral-400">Nenhum usuário encontrado.</p>}</div>}
        </div>
      </div>
    </div>
  );
}
