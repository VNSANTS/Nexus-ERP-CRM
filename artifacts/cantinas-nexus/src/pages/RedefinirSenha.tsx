import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useOwnerAuth } from '../lib/owner-auth';

export function RedefinirSenha() {
  const [, navigate] = useLocation();
  const { session, loading, clearPasswordRecovery } = useOwnerAuth();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      clearPasswordRecovery();
      toast.success('Senha atualizada. Faça login com a nova senha.');
      navigate('/');
    } catch (error) {
      console.error('Falha ao redefinir senha:', error);
      toast.error('Não foi possível atualizar a senha. Solicite um novo link e tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-500">Validando link de redefinição...</main>;
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-neutral-900">Link inválido ou expirado</h1>
          <p className="mt-2 text-sm text-neutral-500">Volte ao login e solicite um novo link para redefinir sua senha.</p>
          <button type="button" onClick={() => navigate('/')} className="mt-5 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white">Ir para o login</button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <form onSubmit={salvar} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-sm md:p-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Redefinir senha</h1>
          <p className="mt-2 text-sm text-neutral-500">Escolha uma nova senha para acessar sua conta.</p>
        </div>
        <label className="block text-sm font-medium text-neutral-700">
          Nova senha
          <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={(event) => setSenha(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Confirmar nova senha
          <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" type="password" autoComplete="new-password" minLength={8} required value={confirmacao} onChange={(event) => setConfirmacao(event.target.value)} />
        </label>
        <button className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </main>
  );
}
