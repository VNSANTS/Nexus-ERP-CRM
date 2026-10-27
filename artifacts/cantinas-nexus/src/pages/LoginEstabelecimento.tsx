import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

export function LoginEstabelecimento() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  async function handleRecuperarSenha() {
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm) {
      toast.error('Digite seu e-mail para receber um novo link.');
      return;
    }

    setRecoverySubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailNorm, {
        // GitHub Pages retorna HTTP 404 em rotas internas antes do fallback da SPA.
        // A raiz sempre responde 200; o App encaminha sessões de recovery ao onboarding.
        redirectTo: 'https://vnsants.github.io/Nexus-ERP-CRM/',
      });
      if (error) {
        toast.error('Não foi possível enviar o link. Tente novamente em alguns minutos.');
        return;
      }
      toast.success('Se o e-mail estiver cadastrado, enviaremos um link para definir a senha.');
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao solicitar um novo link.');
    } finally {
      setRecoverySubmitting(false);
    }
  }

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
      navigate('/estabelecimento');
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm md:p-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 text-sm font-medium text-neutral-500 hover:text-neutral-800"
        >
          ← Voltar para o login
        </button>

        <h1 className="text-lg font-semibold text-neutral-900">Login do estabelecimento</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Acesso para donos de estabelecimento já aprovados.
        </p>

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
          <div className="-mt-2 text-right">
            <button
              type="button"
              onClick={handleRecuperarSenha}
              disabled={recoverySubmitting}
              className="text-xs font-medium text-neutral-500 underline hover:text-neutral-800 disabled:opacity-60"
            >
              {recoverySubmitting ? 'Enviando link...' : 'Definir ou recuperar senha'}
            </button>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-neutral-400">
          Ainda não tem um estabelecimento?{' '}
          <button
            type="button"
            onClick={() => navigate('/solicitar-estabelecimento')}
            className="font-medium text-neutral-600 underline"
          >
            Solicitar cadastro
          </button>
        </p>
      </div>
    </div>
  );
}
