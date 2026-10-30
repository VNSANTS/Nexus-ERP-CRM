// Autentica clientes por e-mail, telefone ou CPF sem revelar o e-mail
// associado ao identificador enviado.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { getClientIp, checkRateLimit } from '../_shared/security.ts';

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MIN = 60;
const INVALID_CREDENTIALS = 'E-mail, telefone, CPF ou senha incorretos.';

function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAdmin = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const rate = await checkRateLimit(
      supabaseAdmin,
      'customer_login',
      getClientIp(req),
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MIN,
    );
    if (!rate.allowed) return errorResponse('Muitas tentativas. Tente novamente mais tarde.', 429);

    const body = await req.json();
    const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const action = body?.action === 'options' ? 'options' : 'login';
    const accountId = typeof body?.accountId === 'string' ? body.accountId : '';
    if (!identifier || identifier.length > 254 || (action === 'login' && (!password || password.length > 256))) {
      return errorResponse(INVALID_CREDENTIALS, 401);
    }

    let email: string | null = identifier.includes('@') ? identifier.toLowerCase() : null;
    const digits = identifier.replace(/\D/g, '');

    const maskEmail = (value: string) => {
      const [local, domain] = value.toLowerCase().split('@');
      const [host, ...suffix] = domain.split('.');
      return `${local.slice(0, 1)}${'*'.repeat(Math.min(Math.max(local.length - 1, 2), 6))}@${host.slice(0, 1)}${'*'.repeat(Math.min(Math.max(host.length - 1, 2), 6))}.${suffix.join('.')}`;
    };

    if (action === 'options') {
      if (!isValidCpf(digits)) return jsonResponse({ accounts: [] });
      const [{ data: customers }, { data: owners }] = await Promise.all([
        supabaseAdmin.from('customer_accounts').select('id,nome,email').eq('cpf', digits),
        supabaseAdmin.from('establishment_owners').select('id,establishment_id,nome_completo,email').eq('cpf_cnpj', digits),
      ]);
      const establishmentIds = (owners ?? []).map((item) => item.establishment_id);
      const { data: establishments } = establishmentIds.length
        ? await supabaseAdmin.from('establishments').select('id,apelido,nome_completo').in('id', establishmentIds)
        : { data: [] };
      const accounts = [
        ...(customers ?? []).filter((item) => item.email).map((item) => ({
          accountId: item.id, kind: 'customer', label: item.nome || 'Conta de cliente', email: maskEmail(item.email),
        })),
        ...(owners ?? []).flatMap((owner) => {
          const establishment = (establishments ?? []).find((item) => item.id === owner.establishment_id);
          return owner.email ? [{
            accountId: owner.id, kind: 'owner', label: establishment?.apelido || establishment?.nome_completo || owner.nome_completo || 'Estabelecimento', email: maskEmail(owner.email),
          }] : [];
        }),
      ];
      return jsonResponse({ accounts });
    }

    if (!email && digits.length >= 10) {
      if (accountId && digits.length === 11) {
        const { data: customer } = await supabaseAdmin
          .from('customer_accounts').select('email').eq('id', accountId).eq('cpf', digits).maybeSingle();
        if (customer?.email) email = customer.email;
        if (!email) {
          const { data: owner } = await supabaseAdmin
            .from('establishment_owners').select('email').eq('id', accountId).eq('cpf_cnpj', digits).maybeSingle();
          if (owner) {
            email = owner.email ?? null;
          }
        }
      } else if (digits.length === 11 || digits.length === 14) {
        const { data: byCpf } = await supabaseAdmin
          .from('customer_accounts')
          .select('email')
          .eq('cpf', digits)
          .maybeSingle();
        email = byCpf?.email ?? null;
      }

      if (!email) {
        const { data: byPhone } = await supabaseAdmin
          .from('customer_accounts')
          .select('email')
          .eq('telefone', digits)
          .maybeSingle();
        email = byPhone?.email ?? null;
      }
    }
    if (!email) return errorResponse(INVALID_CREDENTIALS, 401);

    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );
    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (authError || !authData.session) return errorResponse(INVALID_CREDENTIALS, 401);

    // Retorna apenas os artefatos necessários para estabelecer a sessão.
    return jsonResponse({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at,
      expires_in: authData.session.expires_in,
      token_type: authData.session.token_type,
    });
  } catch (err) {
    console.error('Falha na autenticação de cliente:', err instanceof Error ? err.name : 'erro desconhecido');
    return errorResponse('Não foi possível entrar. Tente novamente.', 500);
  }
});
