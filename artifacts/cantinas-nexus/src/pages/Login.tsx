import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { isValidEmail } from '../lib/validators';

type Mode = 'login' | 'signup';

export function Login() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>('login');
  const [submitting, setSubmitting] = useState(false);

  // Login
  const [identifier, setIdentifier] = useState('');
  const [loginSenha, setLoginSenha] = useState('');

  // Sign up
  const [signupEmail, setSignupEmail] = useState('');
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
      let email = identifier.trim().toLowerCase();

      // Se não for e-mail, resolve via Edge Function (telefone ou CPF)
      if (!identifier.includes('@')) {
        const { data, error } = await supabase.functions.invoke('customer-login-lookup', {
          body: { identifier: identifier.trim() },
        });
        if (error || data?.error || !data?.email) {
          toast.error('E-mail, telefone, CPF ou senha incorretos.');
          setSubmitting(false);
          return;
        }
        email = data.email;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: loginSenha,
      });

      if (signInError) {
        toast.error('E-mail, telefone, CPF ou senha incorretos.');
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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(signupEmail)) {
      toast.error('E-mail inválido.');
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-center text-2xl font-semibold text-neutral-900">Nexus</h1>

        <div className="mt-6 flex rounded-lg bg-neutral-100 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'login' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'signup' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
            }`}
          >
            Sign up
          </button>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                E-mail, telefone ou CPF
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Senha</label>
              <input
                type="password"
                value={loginSenha}
                onChange={(e) => setLoginSenha(e.target.value)}
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
        )}

        {mode === 'signup' && !signupSent && (
          <form onSubmit={handleSignup} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail</label>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
              />
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

        {mode === 'signup' && signupSent && (
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
          onClick={() => navigate('/solicitar-estabelecimento')}
          className="mt-6 w-full text-center text-sm font-medium text-neutral-500 hover:text-neutral-800"
        >
          Quero cadastrar meu estabelecimento →
        </button>
      </div>
    </div>
  );
}
