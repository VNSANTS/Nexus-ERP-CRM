import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useCustomerAuth } from '../lib/customer-auth';
import {
  isValidCpf,
  formatCpfCnpj,
  isValidCep,
  formatCep,
  formatTelefone,
  lookupCep,
} from '../lib/validators';

export function CompletarCadastro() {
  const [, navigate] = useLocation();
  const { session, profile, loading, refreshProfile } = useCustomerAuth();

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState(false);
  const [cpf, setCpf] = useState('');
  const [enderecoCep, setEnderecoCep] = useState('');
  const [enderecoLogradouro, setEnderecoLogradouro] = useState('');
  const [enderecoNumero, setEnderecoNumero] = useState('');
  const [enderecoComplemento, setEnderecoComplemento] = useState('');
  const [enderecoBairro, setEnderecoBairro] = useState('');
  const [enderecoCidade, setEnderecoCidade] = useState('');
  const [enderecoUf, setEnderecoUf] = useState('');
  const [enderecoEditavel, setEnderecoEditavel] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Redireciona quem não está logado, e quem já completou o cadastro
  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate('/');
      return;
    }
    if (profile?.cadastroCompleto) {
      navigate('/estabelecimentos');
    }
  }, [loading, session, profile, navigate]);

  async function handleCepBlur() {
    const digits = enderecoCep.replace(/\D/g, '');
    if (!isValidCep(digits)) return;

    setCepLoading(true);
    const result = await lookupCep(digits);
    setCepLoading(false);

    if (!result.ok) {
      toast.error(result.message);
      setEnderecoEditavel(true);
      return;
    }

    setEnderecoLogradouro(result.logradouro);
    setEnderecoBairro(result.bairro);
    setEnderecoCidade(result.cidade);
    setEnderecoUf(result.uf);
    setEnderecoEditavel(!result.logradouro);
  }

  function validate(): string | null {
    if (!nome.trim()) return 'Informe seu nome completo.';
    if (!telefone.trim()) return 'Informe seu telefone.';
    if (!isValidCpf(cpf)) return 'CPF inválido.';
    if (!isValidCep(enderecoCep)) return 'CEP inválido.';
    if (!enderecoLogradouro.trim()) return 'Informe o logradouro.';
    if (!enderecoNumero.trim()) return 'Informe o número.';
    if (!enderecoBairro.trim()) return 'Informe o bairro.';
    if (!enderecoCidade.trim()) return 'Informe a cidade.';
    if (!/^[A-Za-z]{2}$/.test(enderecoUf.trim())) return 'Informe a UF (2 letras).';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error('Sessão expirada. Faça login novamente.');
        navigate('/');
        return;
      }

      const { data, error } = await supabase.functions.invoke('customer-signup-step2', {
        body: {
          nome: nome.trim(),
          telefone: telefone.trim(),
          telefoneWhatsapp,
          cpf: cpf.trim(),
          enderecoCep: enderecoCep.trim(),
          enderecoLogradouro: enderecoLogradouro.trim(),
          enderecoNumero: enderecoNumero.trim(),
          enderecoComplemento: enderecoComplemento.trim(),
          enderecoBairro: enderecoBairro.trim(),
          enderecoCidade: enderecoCidade.trim(),
          enderecoUf: enderecoUf.trim().toUpperCase(),
        },
      });

      if (error || data?.error) {
        toast.error(data?.error ?? 'Não foi possível salvar seu cadastro.');
        return;
      }

      toast.success('Cadastro completado com sucesso!');
      await refreshProfile();
      navigate('/estabelecimentos');
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Complete seu cadastro</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Falta pouco. Precisamos desses dados para identificar seus pedidos e entregas.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Nome completo</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Telefone</label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(formatTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              required
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={telefoneWhatsapp}
                onChange={(e) => setTelefoneWhatsapp(e.target.checked)}
                className="rounded border-neutral-300"
              />
              Este número é WhatsApp
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">CPF</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(formatCpfCnpj(e.target.value))}
              placeholder="000.000.000-00"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              required
            />
          </div>

          <div className="border-t border-neutral-200 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-neutral-800">Endereço</h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr]">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">CEP</label>
                <input
                  type="text"
                  value={enderecoCep}
                  onChange={(e) => setEnderecoCep(formatCep(e.target.value))}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                  required
                />
                {cepLoading && <p className="mt-1 text-xs text-neutral-400">Buscando endereço...</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Logradouro</label>
                <input
                  type="text"
                  value={enderecoLogradouro}
                  onChange={(e) => setEnderecoLogradouro(e.target.value)}
                  disabled={!enderecoEditavel && !!enderecoLogradouro}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  required
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Número</label>
                <input
                  type="text"
                  value={enderecoNumero}
                  onChange={(e) => setEnderecoNumero(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Complemento (opcional)</label>
                <input
                  type="text"
                  value={enderecoComplemento}
                  onChange={(e) => setEnderecoComplemento(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_80px]">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Bairro</label>
                <input
                  type="text"
                  value={enderecoBairro}
                  onChange={(e) => setEnderecoBairro(e.target.value)}
                  disabled={!enderecoEditavel && !!enderecoBairro}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Cidade</label>
                <input
                  type="text"
                  value={enderecoCidade}
                  onChange={(e) => setEnderecoCidade(e.target.value)}
                  disabled={!enderecoEditavel && !!enderecoCidade}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">UF</label>
                <input
                  type="text"
                  value={enderecoUf}
                  onChange={(e) => setEnderecoUf(e.target.value.toUpperCase().slice(0, 2))}
                  disabled={!enderecoEditavel && !!enderecoUf}
                  maxLength={2}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm uppercase focus:border-neutral-500 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {submitting ? 'Salvando...' : 'Concluir cadastro'}
          </button>
        </form>
      </div>
    </div>
  );
}
