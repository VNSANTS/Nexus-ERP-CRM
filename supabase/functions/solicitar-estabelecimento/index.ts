// supabase/functions/solicitar-estabelecimento/index.ts
//
// Ponto de entrada público do formulário "Cadastrar estabelecimento".
// Protegido por: rate limit (100/hora por IP), CAPTCHA (Turnstile),
// validação de CPF/CNPJ e de endereço (CEP), verificação de domínio de
// e-mail via DNS, e checagem de bloqueio (blocked_identifiers). Grava a
// solicitação e avisa o admin da Nexus por e-mail (via Resend). Não expõe
// se um e-mail/CPF já está cadastrado ou bloqueado.
//
// O dono NÃO define senha nesta etapa — se a solicitação for aprovada,
// ele recebe um link por e-mail (Supabase Auth) para definir a própria
// senha. Isso evita transitar/guardar senha em texto puro nesta function.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { getClientIp, checkRateLimit, verifyTurnstile } from '../_shared/security.ts';
import { sendEmail } from '../_shared/email.ts';

const RATE_LIMIT_MAX = 100; // por hora, por IP — pedido explícito do Vinícius
const RATE_LIMIT_WINDOW_MIN = 60;

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

function isValidCep(cep: string): boolean {
  return /^\d{8}$/.test(cep.replace(/\D/g, ''));
}

// Verifica se o domínio do e-mail existe e recebe e-mail, consultando o DNS
// via Cloudflare DNS-over-HTTPS. Se a consulta falhar (rede/timeout) ou vier
// inconclusiva, ACEITA: é melhor não bloquear um usuário legítimo por falha
// de infraestrutura.
async function domainReceivesEmail(domain: string): Promise<boolean> {
  const query = async (type: 'MX' | 'A') => {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(3000) },
    );
    return (await res.json()) as { Status: number; Answer?: Array<{ type: number }> };
  };

  try {
    const mx = await query('MX');
    if (mx.Status === 3) return false; // NXDOMAIN: o domínio não existe
    if (mx.Status !== 0) return true; // resposta inconclusiva
    if (mx.Answer?.some((r) => r.type === 15)) return true;

    // Sem MX: e-mail ainda pode ser entregue no registro A do domínio
    const a = await query('A');
    if (a.Status === 3) return false;
    if (a.Status !== 0) return true;
    return Boolean(a.Answer?.some((r) => r.type === 1));
  } catch (err) {
    console.error('Falha ao consultar DNS do e-mail (aceitando):', err);
    return true;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = getClientIp(req);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const {
      nome,
      email,
      telefone,
      cpfCnpj,
      turnstileToken,
      enderecoCep,
      enderecoLogradouro,
      enderecoNumero,
      enderecoComplemento,
      enderecoBairro,
      enderecoCidade,
      enderecoUf,
    } = body;

    // 1) Rate limit — no máximo 100 solicitações por hora por IP
    const rate = await checkRateLimit(supabase, 'establishment_request', ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MIN);
    if (!rate.allowed) {
      return errorResponse('Muitas solicitações vindas deste endereço. Tente novamente mais tarde.', 429);
    }

    // 2) CAPTCHA
    const humanOk = await verifyTurnstile(turnstileToken, ip);
    if (!humanOk) {
      return errorResponse('Verificação de segurança falhou. Recarregue a página e tente novamente.', 400);
    }

    // 3) Validação de campos básicos
    if (!nome?.trim() || !email?.trim() || !telefone?.trim() || !cpfCnpj?.trim()) {
      return errorResponse('Todos os campos são obrigatórios.', 400);
    }
    if (!isValidCpfCnpj(cpfCnpj)) {
      return errorResponse('CPF ou CNPJ inválido.', 400);
    }
    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return errorResponse('E-mail inválido.', 400);
    }
    if (!(await domainReceivesEmail(emailNorm.split('@')[1]))) {
      return errorResponse('Não encontramos esse domínio de e-mail. Confira se digitou corretamente.', 400);
    }

    // 4) Validação de endereço (obrigatório)
    if (
      !enderecoCep?.trim() ||
      !enderecoLogradouro?.trim() ||
      !enderecoNumero?.trim() ||
      !enderecoBairro?.trim() ||
      !enderecoCidade?.trim() ||
      !enderecoUf?.trim()
    ) {
      return errorResponse('Endereço completo é obrigatório (CEP, logradouro, número, bairro, cidade e UF).', 400);
    }
    if (!isValidCep(enderecoCep)) {
      return errorResponse('CEP inválido.', 400);
    }
    if (!/^[A-Za-z]{2}$/.test(enderecoUf.trim())) {
      return errorResponse('UF inválida.', 400);
    }

    // 5) Checa bloqueio — mensagem genérica, igual à de sucesso, para não
    // revelar ao solicitante que ele está bloqueado (evita tentativa de
    // descobrir qual dado disparou o bloqueio).
    const cpfCnpjDigits = cpfCnpj.replace(/\D/g, '');
    const { data: blocked } = await supabase
      .from('blocked_identifiers')
      .select('id')
      .eq('contexto', 'establishment_request')
      .or(`and(tipo.eq.cpf_cnpj,valor.eq.${cpfCnpjDigits}),and(tipo.eq.email,valor.eq.${emailNorm})`)
      .limit(1)
      .maybeSingle();

    if (blocked) {
      return jsonResponse({ ok: true, message: 'Solicitação recebida. Você será notificado por e-mail sobre o andamento.' });
    }

    // 6) Grava a solicitação (mensagem de sucesso é sempre a mesma,
    // exista ou não conflito — não revelamos duplicidade de e-mail/CPF).
    // IMPORTANTE: id precisa ser um UUID de verdade, pois a coluna é do
    // tipo uuid no Postgres — crypto.randomUUID(), não a função uid() de
    // _shared/helpers.ts (essa gera string curta, não-UUID).
    const requestId = crypto.randomUUID();

    const { error } = await supabase.from('establishment_requests').insert({
      id: requestId,
      owner_nome: nome.trim(),
      owner_email: emailNorm,
      owner_telefone: telefone.trim(),
      owner_cpf_cnpj: cpfCnpjDigits,
      status: 'pendente',
      endereco_cep: enderecoCep.replace(/\D/g, ''),
      endereco_logradouro: enderecoLogradouro.trim(),
      endereco_numero: enderecoNumero.trim(),
      endereco_complemento: enderecoComplemento?.trim() || null,
      endereco_bairro: enderecoBairro.trim(),
      endereco_cidade: enderecoCidade.trim(),
      endereco_uf: enderecoUf.trim().toUpperCase(),
    });

    if (error) {
      // Loga o erro real mas não expõe detalhes ao requisitante
      console.error('Erro ao gravar solicitação:', error);
      return errorResponse('Não foi possível registrar sua solicitação agora. Tente novamente em instantes.', 500);
    }

    // 7) Notifica o admin da Nexus por e-mail (não bloqueia a resposta
    // ao usuário se o e-mail falhar — a solicitação já foi gravada)
    const adminEmail = Deno.env.get('NEXUS_ADMIN_EMAIL');
    if (adminEmail) {
      try {
        await sendEmail({
          to: adminEmail,
          subject: `Nova solicitação de estabelecimento — ${nome.trim()}`,
          html: `
            <h2>Nova solicitação de estabelecimento</h2>
            <p><strong>Nome:</strong> ${nome.trim()}</p>
            <p><strong>E-mail:</strong> ${emailNorm}</p>
            <p><strong>Telefone:</strong> ${telefone.trim()}</p>
            <p><strong>CPF/CNPJ:</strong> ${cpfCnpj.trim()}</p>
            <p><strong>Endereço:</strong> ${enderecoLogradouro.trim()}, ${enderecoNumero.trim()}
              ${enderecoComplemento?.trim() ? `- ${enderecoComplemento.trim()}` : ''}
              — ${enderecoBairro.trim()}, ${enderecoCidade.trim()}/${enderecoUf.trim().toUpperCase()}
              (CEP ${enderecoCep.trim()})</p>
            <p><strong>Prazo para decisão:</strong> 90 dias a partir de agora.</p>
            <p>ID da solicitação: ${requestId}</p>
            <p><a href="https://vnsants.github.io/Nexus-ERP-CRM/painel-raiz">Abrir painel de aprovação</a></p>
          `,
        });
      } catch (emailErr) {
        console.error('Falha ao enviar e-mail de notificação:', emailErr);
      }
    }

    return jsonResponse({ ok: true, message: 'Solicitação recebida. Você será notificado por e-mail sobre o andamento.' });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao processar solicitação.', 500);
  }
});
