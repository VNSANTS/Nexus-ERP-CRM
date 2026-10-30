// Autentica clientes por e-mail, telefone ou CPF sem revelar o e-mail
// associado ao identificador enviado.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { getClientIp, checkRateLimit } from '../_shared/security.ts';

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MIN = 60;
const INVALID_CREDENTIALS = 'E-mail, telefone, CPF ou senha incorretos.';

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
    if (!identifier || identifier.length > 254 || !password || password.length > 256) {
      return errorResponse(INVALID_CREDENTIALS, 401);
    }

    let email: string | null = identifier.includes('@') ? identifier.toLowerCase() : null;
    const digits = identifier.replace(/\D/g, '');

    if (!email && digits.length >= 10) {
      if (digits.length === 11 || digits.length === 14) {
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
