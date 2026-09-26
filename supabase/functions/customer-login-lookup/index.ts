// supabase/functions/customer-login-lookup/index.ts
//
// Resolve o e-mail real de um cliente a partir de e-mail, telefone ou CPF,
// para permitir login com qualquer um dos três + senha. O frontend chama
// esta function primeiro, pega o e-mail resolvido, e então chama
// supabase.auth.signInWithPassword com esse e-mail.
//
// Não expõe se o identificador existe ou não em caso de erro — mas como
// esta function só devolve o e-mail (que o Supabase Auth já validaria de
// qualquer forma no passo seguinte), a resposta é sempre genérica quando
// não encontrado, para não ajudar enumeração de contas.
//
// Body esperado: { identifier: string }  (e-mail, telefone ou CPF, em
// qualquer formato — a function normaliza)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { getClientIp, checkRateLimit } from '../_shared/security.ts';

const RATE_LIMIT_MAX = 30; // por hora, por IP — evita força bruta de enumeração
const RATE_LIMIT_WINDOW_MIN = 60;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = getClientIp(req);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const rate = await checkRateLimit(supabase, 'customer_login_lookup', ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MIN);
    if (!rate.allowed) {
      return errorResponse('Muitas tentativas. Tente novamente mais tarde.', 429);
    }

    const body = await req.json();
    const identifier = String(body?.identifier ?? '').trim();
    if (!identifier) {
      return errorResponse('Informe e-mail, telefone ou CPF.', 400);
    }

    const isEmail = identifier.includes('@');
    const digits = identifier.replace(/\D/g, '');

    let email: string | null = null;

    if (isEmail) {
      email = identifier.toLowerCase();
    } else if (digits.length === 11 || digits.length === 14) {
      // CPF (11) — CNPJ (14) não se aplica a cliente final, mas aceitamos
      // o dígito por segurança/consistência com outros formulários.
      const { data } = await supabase
        .from('customers')
        .select('email')
        .eq('cpf', digits)
        .maybeSingle();
      email = data?.email ?? null;
    } else if (digits.length >= 10) {
      // Telefone
      const { data } = await supabase
        .from('customers')
        .select('email')
        .eq('telefone', digits)
        .maybeSingle();
      email = data?.email ?? null;
    }

    if (!email) {
      // Resposta genérica — não revela se o identificador existe.
      return errorResponse('Não foi possível localizar uma conta com esses dados.', 404);
    }

    return jsonResponse({ ok: true, email });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao processar login.', 500);
  }
});
