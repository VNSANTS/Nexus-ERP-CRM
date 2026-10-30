import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useOwnerAuth } from '../lib/owner-auth';
import { isValidCpfCnpj, formatCpfCnpj, isValidEmail } from '../lib/validators';
import { PasswordField } from '../components/PasswordField';

type Funcionario = {
  id: string;
  nome: string;
  acessoCozinha: boolean;
  acessoCaixa: boolean;
  acessoAdm: boolean;
};

async function obterMensagemErroFunction(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null;
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;

  try {
    const payload = await context.clone().json();
    return typeof payload?.error === 'string' ? payload.error : null;
  } catch {
    return null;
  }
}

export function OnboardingEstabelecimento() {
  const [, navigate] = useLocation();
  const { session, establishment, loading, isPasswordRecovery, isAccountInvitation, refreshEstablishment, clearPasswordRecovery } = useOwnerAuth();
  const precisaDefinirSenha = isPasswordRecovery || isAccountInvitation;
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [senha, setSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  async function definirSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmacaoSenha) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setSalvandoSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        toast.error(
          error.code === 'same_password'
            ? 'Essa senha já é a senha atual da conta. Escolha outra senha ou entre normalmente para continuar.'
            : error.message || 'Não foi possível concluir o cadastro. Solicite um novo link e tente novamente.',
        );
        return;
      }

      clearPasswordRecovery();
      await refreshEstablishment();
      toast.success('Senha definida. Vamos configurar seu estabelecimento.');
      setSenha('');
      setConfirmacaoSenha('');
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível concluir a definição da senha.');
    } finally {
      setSalvandoSenha(false);
    }
  }

  useEffect(() => {
    const callbackParams = new URLSearchParams(
      `${window.location.search.replace(/^\?/, '')}&${window.location.hash.replace(/^#/, '')}`,
    );
    if (callbackParams.has('error') || callbackParams.has('error_code')) {
      toast.error('Este link de senha expirou ou já foi usado. Solicite um novo link para continuar.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (precisaDefinirSenha) return;
    if (loading) return;
    if (!session) {
      navigate('/estabelecimento/login');
      return;
    }
    if (!establishment) {
      // Logado mas não é dono de nenhum estabelecimento
      navigate('/estabelecimento/login');
      return;
    }
    if (establishment.onboardingCompleto) {
      navigate('/estabelecimento');
    }
  }, [loading, session, establishment, precisaDefinirSenha, navigate]);

  if (precisaDefinirSenha) {
    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-50">
          <p className="text-sm text-neutral-400">Validando seu acesso...</p>
        </div>
      );
    }

    if (!session) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-neutral-900">Link inválido ou expirado</h1>
            <p className="mt-2 text-sm text-neutral-500">Volte ao login e solicite um novo link para definir sua senha.</p>
            <button type="button" onClick={() => navigate('/estabelecimento/login')}
              className="mt-5 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white">
              Ir para o login
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
        <form onSubmit={definirSenha} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm md:p-8">
          <h1 className="text-xl font-semibold text-neutral-900">Conclua seu cadastro</h1>
          <p className="mt-2 text-sm text-neutral-500">Crie sua senha para ativar o acesso e seguir para a configuração do estabelecimento.</p>
          <label className="mb-1 mt-6 block text-sm font-medium text-neutral-700">Nova senha</label>
          <PasswordField value={senha} onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password" minLength={8} required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          <label className="mb-1 mt-4 block text-sm font-medium text-neutral-700">Confirme a nova senha</label>
          <PasswordField value={confirmacaoSenha} onChange={(e) => setConfirmacaoSenha(e.target.value)}
            autoComplete="new-password" minLength={8} required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          <button type="submit" disabled={salvandoSenha}
            className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60">
            {salvandoSenha ? 'Salvando senha...' : 'Definir senha e continuar'}
          </button>
        </form>
      </div>
    );
  }

  if (loading || !session || !establishment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <StepIndicator etapa={etapa} />

        {etapa === 1 && (
          <Passo1
            establishment={establishment}
            onConcluido={() => setEtapa(2)}
          />
        )}
        {etapa === 2 && (
          <Passo2
            funcionarios={funcionarios}
            setFuncionarios={setFuncionarios}
            ownerEmail={session.user.email ?? ''}
            onVoltar={() => setEtapa(1)}
            onConcluido={() => setEtapa(3)}
          />
        )}
        {etapa === 3 && (
          <Passo3
            onFinalizado={async () => {
              await refreshEstablishment();
              navigate('/estabelecimento');
            }}
          />
        )}
      </div>
    </div>
  );
}

function StepIndicator({ etapa }: { etapa: 1 | 2 | 3 }) {
  const steps = ['Dados do estabelecimento', 'Primeiro funcionário', 'Concluir'];
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const ativo = n === etapa;
        const feito = n < etapa;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                ativo
                  ? 'bg-neutral-900 text-white'
                  : feito
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-200 text-neutral-500'
              }`}
            >
              {feito ? '✓' : n}
            </div>
            {n < 3 && <div className="h-px w-8 bg-neutral-300" />}
          </div>
        );
      })}
    </div>
  );
}

// === Passo 1: dados do estabelecimento ===
function Passo1({
  establishment,
  onConcluido,
}: {
  establishment: { nomeCompleto: string; apelido: string; email: string; cpfCnpj: string };
  onConcluido: () => void;
}) {
  const [nomeCompleto, setNomeCompleto] = useState(establishment.nomeCompleto ?? '');
  const [apelido, setApelido] = useState(establishment.apelido ?? '');
  const [email, setEmail] = useState(establishment.email ?? '');
  const [cpfCnpj, setCpfCnpj] = useState(formatCpfCnpj(establishment.cpfCnpj ?? ''));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeCompleto.trim() || !apelido.trim()) {
      toast.error('Nome completo e apelido são obrigatórios.');
      return;
    }
    if (!isValidEmail(email)) {
      toast.error('E-mail inválido.');
      return;
    }
    if (!isValidCpfCnpj(cpfCnpj)) {
      toast.error('CPF ou CNPJ inválido.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('completar-onboarding-passo1', {
        body: { nomeCompleto: nomeCompleto.trim(), apelido: apelido.trim(), email: email.trim(), cpfCnpj: cpfCnpj.trim() },
      });
      if (error || data?.error) {
        const mensagem = data?.error ?? (error ? await obterMensagemErroFunction(error) : null);
        toast.error(mensagem ?? 'Nao foi possivel salvar os dados.');
        return;
      }
      toast.success('Dados salvos.');
      onConcluido();
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm md:p-8">
      <h1 className="text-xl font-semibold text-neutral-900">Dados do estabelecimento</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Essas informações aparecem para os clientes no cardápio.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Nome completo do estabelecimento</label>
          <input value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Apelido (como aparece no cardápio)</label>
          <input value={apelido} onChange={(e) => setApelido(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail do estabelecimento</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">CPF ou CNPJ da empresa</label>
          <input value={cpfCnpj} onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
          <p className="mt-1 text-xs text-neutral-400">Pode ser o mesmo CPF usado na solicitação, ou o CNPJ da empresa.</p>
        </div>

        <button type="submit" disabled={submitting}
          className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60">
          {submitting ? 'Salvando...' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}

// === Passo 2: criar funcionários ===
function Passo2({
  funcionarios,
  setFuncionarios,
  ownerEmail,
  onVoltar,
  onConcluido,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: (f: Funcionario[]) => void;
  ownerEmail: string;
  onVoltar: () => void;
  onConcluido: () => void;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [acessoCozinha, setAcessoCozinha] = useState(true);
  const [acessoCaixa, setAcessoCaixa] = useState(false);
  const [acessoAdm, setAcessoAdm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !isValidEmail(email) || senha.length < 8) {
      toast.error('Preencha nome, e-mail válido e senha com ao menos 8 caracteres.');
      return;
    }
    if (!acessoCozinha && !acessoCaixa && !acessoAdm) {
      toast.error('Selecione ao menos um tipo de acesso.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('criar-funcionario', {
        body: { nome: nome.trim(), email: email.trim(), senha, acessoCozinha, acessoCaixa, acessoAdm },
      });
      if (error || data?.error) {
        const mensagem = data?.error ?? (error ? await obterMensagemErroFunction(error) : null);
        toast.error(mensagem ?? 'Nao foi possivel criar o funcionario.');
        return;
      }
      setFuncionarios([
        ...funcionarios,
        { id: data.employeeId, nome: nome.trim(), acessoCozinha, acessoCaixa, acessoAdm },
      ]);
      toast.success('Funcionário criado.');
      setNome(''); setEmail(''); setSenha('');
      setAcessoCozinha(true); setAcessoCaixa(false); setAcessoAdm(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm md:p-8">
      <h1 className="text-xl font-semibold text-neutral-900">Crie o primeiro funcionário</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Esse acesso será usado para entrar na cozinha, no caixa ou no painel administrativo.
      </p>

      {funcionarios.length > 0 && (
        <div className="mt-4 space-y-2">
          {funcionarios.map((f) => (
            <div key={f.id} className="rounded-lg bg-neutral-50 p-3 text-sm">
              <p className="font-medium text-neutral-800">{f.nome}</p>
              <p className="text-xs text-neutral-500">
                {[f.acessoCozinha && 'Cozinha', f.acessoCaixa && 'Caixa', f.acessoAdm && 'ADM'].filter(Boolean).join(', ')}
              </p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdicionar} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required />
          {ownerEmail && email.trim().toLowerCase() === ownerEmail.trim().toLowerCase() && (
            <p className="mt-1 text-xs text-blue-700">
              Este ja e seu email principal de administrador. Sua conta ja acessa o ADM; nao precisa cadastra-la de novo como funcionario.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Senha</label>
          <PasswordField value={senha} onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" required minLength={8} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">Acessos</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={acessoCozinha} onChange={(e) => setAcessoCozinha(e.target.checked)}
                className="rounded border-neutral-300" />
              Cozinha (estoque, preparo de pedidos)
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={acessoCaixa} onChange={(e) => setAcessoCaixa(e.target.checked)}
                className="rounded border-neutral-300" />
              Caixa (pagamentos, entrega, gestão de pedidos)
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={acessoAdm} onChange={(e) => setAcessoAdm(e.target.checked)}
                className="rounded border-neutral-300" />
              ADM (acesso total ao painel administrativo)
            </label>
          </div>
        </div>

        <button type="submit" disabled={submitting}
          className="w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
          {submitting ? 'Adicionando...' : '+ Adicionar funcionário'}
        </button>
      </form>

      <div className="mt-6 flex gap-2">
        <button type="button" onClick={onVoltar}
          className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
          Voltar
        </button>
        <button
          type="button"
          onClick={onConcluido}
          className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {funcionarios.length === 0 ? 'Continuar sem funcionario' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

// === Passo 3: finalizar ===
function Passo3({ onFinalizado }: { onFinalizado: () => void }) {
  const [submitting, setSubmitting] = useState(false);

  async function handleFinalizar() {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('finalizar-onboarding');
      if (error || data?.error) {
        toast.error(data?.error ?? 'Não foi possível finalizar.');
        return;
      }
      toast.success('Configuração concluída!');
      onFinalizado();
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-sm md:p-8">
      <h1 className="text-xl font-semibold text-neutral-900">Tudo pronto!</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Seu estabelecimento está configurado. Você pode acessar o painel administrativo a qualquer momento.
      </p>
      <button
        type="button"
        onClick={handleFinalizar}
        disabled={submitting}
        className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {submitting ? 'Finalizando...' : 'Concluir configuração'}
      </button>
    </div>
  );
}
