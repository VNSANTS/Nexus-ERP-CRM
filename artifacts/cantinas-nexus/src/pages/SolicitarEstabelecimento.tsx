import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void; 'expired-callback'?: () => void }) => string;
      reset: (widgetId: string) => void;
    };
  }
}

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 ? isValidCpf(value) : digits.length === 14 ? isValidCnpj(value) : false;
}

export function SolicitarEstabelecimento() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    const scriptId = 'turnstile-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      document.body.appendChild(script);
    }

    const renderWidget = () => {
      const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
      if (window.turnstile && turnstileRef.current && !widgetId.current && siteKey) {
        widgetId.current = window.turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          callback: (token: string) => setTurnstileToken(token),
          'error-callback': () => setTurnstileToken(''),
          'expired-callback': () => setTurnstileToken(''),
        });
      }
    };

    const interval = setInterval(() => {
      if (window.turnstile) {
        renderWidget();
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim() || !email.trim() || !telefone.trim() || !cpfCnpj.trim() || !senha) {
      toast.error('Preencha todos os campos.');
      return;
    }
    if (!isValidCpfCnpj(cpfCnpj)) {
      toast.error('CPF ou CNPJ inválido.');
      return;
    }
    if (senha.length < 8) {
      toast.error('A senha administrativa deve ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      toast.error('As senhas não coincidem.');
      return;
    }
    if (!turnstileToken) {
      toast.error('Complete a verificação de segurança.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('solicitar-estabelecimento', {
        body: { nome, email, telefone, cpfCnpj, senha, turnstileToken },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar solicitação.');
      if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
      setTurnstileToken('');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-2xl font-black mb-2">Solicitação enviada!</h1>
          <p className="text-gray-600">
            Você receberá um e-mail em até 90 dias informando se sua solicitação foi aprovada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <form onSubmit={handleSubmit} className="max-w-md w-full mx-auto bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-black mb-1">Criar estabelecimento</h1>
        <p className="text-gray-500 text-sm mb-6">Preencha seus dados para solicitar acesso à plataforma Nexus.</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-medium focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-medium focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Telefone</label>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} required placeholder="(11) 99999-9999"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-medium focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">CPF ou CNPJ</label>
            <input value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} required placeholder="Somente números"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-medium focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Senha administrativa</label>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-medium focus:border-primary focus:outline-none" />
            <span className="text-xs text-gray-400 mt-1 block">Mínimo 8 caracteres. Usada para acessar o painel ADM.</span>
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-1">Confirmar senha</label>
            <input type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} required
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 font-medium focus:border-primary focus:outline-none" />
          </div>

          <div ref={turnstileRef} />

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-white py-3 rounded-2xl font-black hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Enviando...' : 'Enviar solicitação'}
          </button>
        </div>
      </form>
    </div>
  );
}
