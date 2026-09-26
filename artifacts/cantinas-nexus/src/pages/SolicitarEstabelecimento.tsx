import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import {
  isValidCpfCnpj,
  formatCpfCnpj,
  isValidEmail,
  isValidCep,
  formatCep,
  lookupCep,
} from '../lib/validators';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

type FormState = {
  nome: string;
  email: string;
  telefone: string;
  cpfCnpj: string;
  enderecoCep: string;
  enderecoLogradouro: string;
  enderecoNumero: string;
  enderecoComplemento: string;
  enderecoBairro: string;
  enderecoCidade: string;
  enderecoUf: string;
};

const EMPTY_FORM: FormState = {
  nome: '',
  email: '',
  telefone: '',
  cpfCnpj: '',
  enderecoCep: '',
  enderecoLogradouro: '',
  enderecoNumero: '',
  enderecoComplemento: '',
  enderecoBairro: '',
  enderecoCidade: '',
  enderecoUf: '',
};

export function SolicitarEstabelecimento() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [enderecoEditavel, setEnderecoEditavel] = useState(false);

  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileToken = useRef<string>('');

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current || !window.turnstile) return;
    turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token) => {
        turnstileToken.current = token;
      },
      'error-callback': () => {
        turnstileToken.current = '';
      },
      'expired-callback': () => {
        turnstileToken.current = '';
      },
    });
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCepBlur() {
    const digits = form.enderecoCep.replace(/\D/g, '');
    if (!isValidCep(digits)) return;

    setCepLoading(true);
    const result = await lookupCep(digits);
    setCepLoading(false);

    if (!result.ok) {
      toast.error(result.message);
      setEnderecoEditavel(true);
      return;
    }

    setForm((prev) => ({
      ...prev,
      enderecoLogradouro: result.logradouro,
      enderecoBairro: result.bairro,
      enderecoCidade: result.cidade,
      enderecoUf: result.uf,
    }));
    setEnderecoEditavel(!result.logradouro); // se ViaCEP não trouxe logradouro (CEP genérico), deixa editar
  }

  function validate(): string | null {
    if (!form.nome.trim()) return 'Informe seu nome completo.';
    if (!isValidEmail(form.email)) return 'E-mail inválido.';
    if (!form.telefone.trim()) return 'Informe um telefone para contato.';
    if (!isValidCpfCnpj(form.cpfCnpj)) return 'CPF ou CNPJ inválido.';
    if (!isValidCep(form.enderecoCep)) return 'CEP inválido.';
    if (!form.enderecoLogradouro.trim()) return 'Informe o logradouro (rua/avenida).';
    if (!form.enderecoNumero.trim()) return 'Informe o número.';
    if (!form.enderecoBairro.trim()) return 'Informe o bairro.';
    if (!form.enderecoCidade.trim()) return 'Informe a cidade.';
    if (!/^[A-Za-z]{2}$/.test(form.enderecoUf.trim())) return 'Informe a UF (2 letras).';
    if (TURNSTILE_SITE_KEY && !turnstileToken.current) {
      return 'Confirme que você não é um robô.';
    }
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
      const { data, error } = await supabase.functions.invoke('solicitar-estabelecimento', {
        body: {
          nome: form.nome.trim(),
          email: form.email.trim().toLowerCase(),
          telefone: form.telefone.trim(),
          cpfCnpj: form.cpfCnpj.trim(),
          turnstileToken: turnstileToken.current,
          enderecoCep: form.enderecoCep.trim(),
          enderecoLogradouro: form.enderecoLogradouro.trim(),
          enderecoNumero: form.enderecoNumero.trim(),
          enderecoComplemento: form.enderecoComplemento.trim(),
          enderecoBairro: form.enderecoBairro.trim(),
          enderecoCidade: form.enderecoCidade.trim(),
          enderecoUf: form.enderecoUf.trim().toUpperCase(),
        },
      });

      if (error) {
        toast.error('Não foi possível enviar sua solicitação. Tente novamente.');
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        if (window.turnstile && turnstileWidgetId.current) {
          window.turnstile.reset(turnstileWidgetId.current);
        }
        turnstileToken.current = '';
        return;
      }

      toast.success(data?.message ?? 'Solicitação enviada com sucesso!');
      setForm(EMPTY_FORM);
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm md:p-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 text-sm font-medium text-neutral-500 hover:text-neutral-800"
        >
          ← Voltar para o login
        </button>

        <h1 className="text-2xl font-semibold text-neutral-900">Cadastrar estabelecimento</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Preencha os dados abaixo. Sua solicitação será analisada e você receberá um
          e-mail com o resultado em até 90 dias.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Nome completo</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => updateField('nome', e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Telefone</label>
              <input
                type="tel"
                value={form.telefone}
                onChange={(e) => updateField('telefone', e.target.value)}
                placeholder="(00) 00000-0000"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">CPF ou CNPJ</label>
            <input
              type="text"
              value={form.cpfCnpj}
              onChange={(e) => updateField('cpfCnpj', formatCpfCnpj(e.target.value))}
              placeholder="000.000.000-00"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              required
            />
          </div>

          <div className="border-t border-neutral-200 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-neutral-800">Endereço do estabelecimento</h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr]">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">CEP</label>
                <input
                  type="text"
                  value={form.enderecoCep}
                  onChange={(e) => updateField('enderecoCep', formatCep(e.target.value))}
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
                  value={form.enderecoLogradouro}
                  onChange={(e) => updateField('enderecoLogradouro', e.target.value)}
                  disabled={!enderecoEditavel && !!form.enderecoLogradouro}
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
                  value={form.enderecoNumero}
                  onChange={(e) => updateField('enderecoNumero', e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Complemento (opcional)</label>
                <input
                  type="text"
                  value={form.enderecoComplemento}
                  onChange={(e) => updateField('enderecoComplemento', e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_80px]">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Bairro</label>
                <input
                  type="text"
                  value={form.enderecoBairro}
                  onChange={(e) => updateField('enderecoBairro', e.target.value)}
                  disabled={!enderecoEditavel && !!form.enderecoBairro}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Cidade</label>
                <input
                  type="text"
                  value={form.enderecoCidade}
                  onChange={(e) => updateField('enderecoCidade', e.target.value)}
                  disabled={!enderecoEditavel && !!form.enderecoCidade}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">UF</label>
                <input
                  type="text"
                  value={form.enderecoUf}
                  onChange={(e) => updateField('enderecoUf', e.target.value.toUpperCase().slice(0, 2))}
                  disabled={!enderecoEditavel && !!form.enderecoUf}
                  maxLength={2}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm uppercase focus:border-neutral-500 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                  required
                />
              </div>
            </div>
          </div>

          {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="pt-2" />}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {submitting ? 'Enviando...' : 'Enviar solicitação'}
          </button>
        </form>
      </div>
    </div>
  );
}