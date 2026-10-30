import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { api, type ApiEmployee } from '../lib/api';
import { supabase } from '../lib/supabase';
import { isValidEmail, suggestEmailCorrection } from '../lib/validators';

type Mode = 'login' | 'signup';
type LinkedAccount = { accountId: string; kind: 'customer' | 'owner'; label: string; email: string };

export function Login({ onKitchenLogin, ownerMode = false }: { onKitchenLogin?: (employee: ApiEmployee) => void; ownerMode?: boolean } = {}) {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>('login');
  const [submitting, setSubmitting] = useState(false);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  // Login
  const [identifier, setIdentifier] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  const [accountOptions, setAccountOptions] = useState<LinkedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<LinkedAccount | null>(null);
  const [findingAccounts, setFindingAccounts] = useState(false);

  // Sign up
  const [signupEmail, setSignupEmail] = useState('');
  const [emailSugestao, setEmailSugestao] = useState<string | null>(null);
  const [emailConfirmado, setEmailConfirmado] = useState('');
  const [signupSenha, setSignupSenha] = useState('');
  const [signupSenhaConfirm, setSignupSenhaConfirm] = useState('');
  const [signupSent, setSignupSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !loginSenha) {
      toast.error('Preencha e-mail/telefone/CPF e senha.');
      return;
    }

    setSubmitting(true);
    try {
      if (!ownerMode && !selectedAccount) {
        const employeeLogin = await api.employees.login(identifier.trim(), loginSenha);
        if (employeeLogin.ok && employeeLogin.employee) {
          if (onKitchenLogin) onKitchenLogin(employeeLogin.employee);
          else navigate('/cozinha');
          return;
        }
        if (employeeLogin.code !== 'not_employee') {
          toast.error('E-mail, usuário, telefone, CPF ou senha incorretos.');
          return;
        }
      } else if (!identifier.trim().includes('@')) {
        toast.error('No acesso administrativo, use o e-mail do responsável pelo estabelecimento.');
        return;
      }

      if (selectedAccount) {
        const { data: signInData, error: signInError } = await supabase.functions.invoke('customer-login-lookup', {
          body: { identifier: identifier.trim(), accountId: selectedAccount.accountId, password: loginSenha },
        });
        if (signInError || signInData?.error || !signInData?.access_token || !signInData?.refresh_token) {
          toast.error('CPF ou senha incorretos para a conta selecionada.');
          return;
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: signInData.access_token,
          refresh_token: signInData.refresh_token,
        });
        if (sessionError) {
          toast.error('Não foi possível iniciar sua sessão. Tente novamente.');
          return;
        }
      } else if (identifier.trim().includes('@')) {
        // Donos e clientes usam o e-mail diretamente no Supabase Auth.
        // A busca em customer_accounts é necessária apenas para CPF/telefone.
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: identifier.trim().toLowerCase(),
          password: loginSenha,
        });
        if (authError) {
          toast.error('E-mail ou senha incorretos.');
          return;
        }
      } else {
        const { data: signInData, error: signInError } = await supabase.functions.invoke('customer-login-lookup', {
          body: { identifier: identifier.trim(), password: loginSenha },
        });
        if (signInError || signInData?.error || !signInData?.accessToken || !signInData?.refreshToken) {
          toast.error('E-mail, telefone, CPF ou senha incorretos.');
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: signInData.accessToken,
          refresh_token: signInData.refreshToken,
        });
        if (sessionError) {
          toast.error('Não foi possível iniciar sua sessão. Tente novamente.');
          return;
        }
      }

      const { data: ownerData, error: ownerError } = await supabase.functions.invoke('obter-estabelecimento-dono');
      if (ownerData?.establishment) {
        navigate('/estabelecimento');
        return;
      }
      if (ownerMode) {
        await supabase.auth.signOut();
        toast.error('Esta conta não está vinculada como responsável de um estabelecimento.');
        return;
      }
      const ownerResponse = (ownerError as { context?: Response } | null)?.context;
      if (ownerError && ownerResponse?.status !== 403) {
        await supabase.auth.signOut();
        toast.error('Não foi possível identificar o tipo da conta. Tente novamente.');
        return;
      }

      const pendingEstablishmentId = sessionStorage.getItem('nexus:pendingEstablishmentId');
      if (pendingEstablishmentId) {
        sessionStorage.removeItem('nexus:pendingEstablishmentId');
        sessionStorage.setItem('nexus:establishmentId', pendingEstablishmentId);
        navigate(`/e/${encodeURIComponent(pendingEstablishmentId)}`);
        return;
      }

      navigate('/estabelecimentos');
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao entrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function findLinkedAccounts() {
    const digits = identifier.replace(/\D/g, '');
    if (digits.length !== 11) {
      toast.error('Digite um CPF válido para localizar as contas vinculadas.');
      return;
    }
    setFindingAccounts(true);
    setSelectedAccount(null);
    try {
      const { data, error } = await supabase.functions.invoke('customer-login-lookup', {
        body: { action: 'options', identifier: digits },
      });
      if (error || data?.error) throw error ?? new Error('Falha ao consultar contas');
      setAccountOptions((data?.accounts ?? []) as LinkedAccount[]);
      if (!data?.accounts?.length) toast.error('Não encontramos contas vinculadas a esse CPF.');
    } catch {
      toast.error('Não foi possível localizar as contas. Tente novamente.');
    } finally {
      setFindingAccounts(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(signupEmail)) {
      toast.error('E-mail inválido.');
      return;
    }
    const sugestao = suggestEmailCorrection(signupEmail);
    if (sugestao && emailConfirmado !== signupEmail.trim().toLowerCase()) {
      setEmailSugestao(sugestao);
      toast.error('Confira o e-mail digitado: parece haver um erro de digitação.');
      return;
    }
    if (signupSenha.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (signupSenha !== signupSenhaConfirm) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: signupEmail.trim().toLowerCase(),
        password: signupSenha,
        options: {
          emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}completar-cadastro`,
        },
      });

      if (error) {
        toast.error(error.message.includes('already registered')
          ? 'Este e-mail já está cadastrado.'
          : 'Não foi possível criar sua conta. Tente novamente.');
        return;
      }

      setSignupSent(true);
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao criar conta. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordRecovery() {
    const email = identifier.trim().toLowerCase();
    if (!isValidEmail(email)) {
      toast.error('Digite seu e-mail para receber o link de redefinição.');
      return;
    }
    setRecoverySubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      });
      if (error) {
        toast.error('Não foi possível enviar o link. Tente novamente.');
        return;
      }
      toast.success('Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao solicitar a redefinição de senha.');
    } finally {
      setRecoverySubmitting(false);
    }
  }

  return (
    <div className="nexus-noise flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="nexus-surface w-full max-w-md rounded-2xl bg-white p-6 md:p-8">
        <h1 className="text-center font-display text-3xl font-black tracking-tight text-foreground">Nexus</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{ownerMode ? 'Acesso administrativo do estabelecimento' : 'Entre para continuar'}</p>

        {!ownerMode && <section className="mt-6" aria-label="Escolha o tipo de conta">
          <p className="mb-2 text-sm font-semibold text-neutral-800">Como deseja entrar?</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border-2 border-orange-500 bg-orange-50 px-3 py-3 text-left">
              <p className="text-sm font-bold text-neutral-900">Cliente</p>
              <p className="mt-1 text-xs text-neutral-600">Entrar com e-mail, CPF ou telefone</p>
            </div>
            <button type="button" onClick={() => navigate('/estabelecimento/login')} className="rounded-xl border border-neutral-200 bg-white px-3 py-3 text-left hover:border-orange-400 hover:bg-orange-50">
              <p className="text-sm font-bold text-neutral-900">Responsável</p>
              <p className="mt-1 text-xs text-neutral-600">Acessar painel administrativo</p>
            </button>
          </div>
        </section>}

        {!ownerMode && <div className="mt-6 flex rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'login' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'signup' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Criar conta
          </button>
        </div>}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {ownerMode ? 'E-mail do responsável' : 'E-mail, usuário, telefone ou CPF'}
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setAccountOptions([]); setSelectedAccount(null); }}
                placeholder={ownerMode ? 'responsavel@estabelecimento.com' : 'E-mail, usuário, telefone ou CPF'}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
              />
            </div>
            {!ownerMode && identifier.replace(/\D/g, '').length === 11 && !identifier.includes('@') && <div className="-mt-2 space-y-2">
              <button type="button" onClick={findLinkedAccounts} disabled={findingAccounts} className="text-sm font-semibold text-orange-700 hover:text-orange-900 disabled:opacity-60">
                {findingAccounts ? 'Buscando contas…' : 'Escolher conta vinculada a este CPF'}
              </button>
              {accountOptions.length > 0 && <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-xs font-medium text-neutral-600">Selecione pelo tipo e pelo e-mail cadastrado:</p>
                {accountOptions.map((account) => <button key={`${account.kind}:${account.accountId}`} type="button" onClick={() => setSelectedAccount(account)} className={`w-full rounded-lg border p-3 text-left ${selectedAccount?.accountId === account.accountId ? 'border-orange-500 bg-orange-50' : 'border-neutral-200 bg-white hover:border-orange-300'}`}>
                  <span className="block text-sm font-bold text-neutral-900">{account.kind === 'owner' ? 'Responsável do estabelecimento' : 'Cliente'} · {account.label}</span>
                  <span className="mt-1 block text-xs text-neutral-600">{account.email}</span>
                </button>)}
              </div>}
            </div>}
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Senha</label>
              <input
                type="password"
                value={loginSenha}
                onChange={(e) => setLoginSenha(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
              />
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={handlePasswordRecovery}
                  disabled={recoverySubmitting}
                  className="text-xs font-medium text-neutral-500 underline hover:text-neutral-800 disabled:opacity-60"
                >
                  {recoverySubmitting ? 'Enviando link...' : 'Esqueci minha senha'}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        )}

        {!ownerMode && mode === 'signup' && !signupSent && (
          <form onSubmit={handleSignup} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail</label>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => {
                  setSignupEmail(e.target.value);
                  setEmailSugestao(null);
                }}
                onBlur={() => {
                  const s = suggestEmailCorrection(signupEmail);
                  setEmailSugestao(s && emailConfirmado !== signupEmail.trim().toLowerCase() ? s : null);
                }}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
              />
              {emailSugestao && (
                <p className="mt-1 text-xs text-amber-700">
                  Você quis dizer{' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      setSignupEmail(emailSugestao);
                      setEmailSugestao(null);
                    }}
                  >
                    {emailSugestao}
                  </button>
                  ?{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setEmailConfirmado(signupEmail.trim().toLowerCase());
                      setEmailSugestao(null);
                    }}
                  >
                    Manter como está
                  </button>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Senha</label>
              <input
                type="password"
                value={signupSenha}
                onChange={(e) => setSignupSenha(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Confirmar senha</label>
              <input
                type="password"
                value={signupSenhaConfirm}
                onChange={(e) => setSignupSenhaConfirm(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
            >
              {submitting ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>
        )}

        {!ownerMode && mode === 'signup' && signupSent && (
          <div className="mt-6 rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600">
            <p className="font-medium text-neutral-900">Verifique seu e-mail</p>
            <p className="mt-1">
              Enviamos um link de confirmação para <strong>{signupEmail}</strong>. Depois de
              confirmar, você vai completar seu cadastro (nome, telefone, CPF e endereço).
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate(ownerMode ? '/' : '/solicitar-estabelecimento')}
          className="mt-6 w-full text-center text-sm font-medium text-neutral-500 hover:text-neutral-800"
        >
          {ownerMode ? 'Voltar ao login principal' : 'Quero cadastrar meu estabelecimento →'}
        </button>
      </div>
    </div>
  );
}
