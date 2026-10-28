// supabase/functions/cozinha-login/index.ts
//
// Substitui: POST /employees/login (Express)
// Usa o Supabase Auth nativo: cada funcionário é um usuário em auth.users,
// logado com um e-mail sintético derivado do username. O Supabase cuida do
// hashing de senha e da emissão/validação do token — não precisamos mais
// assinar nada manualmente.
//
// SEGURANÇA: rota de login sem limite de tentativas permite força bruta de
// senha. Rate limit por IP (e também por username, para não deixar um IP
// rotativo contornar o limite tentando o mesmo usuário repetidamente).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse, adminClient, usernameToEmail } from '../_shared/helpers.ts';
import { getClientIp, checkRateLimit } from '../_shared/security.ts';

const RATE_LIMIT_MAX_PER_IP = 20; // por hora, por IP
const RATE_LIMIT_MAX_PER_USER = 10; // por hora, por username tentado
const RATE_LIMIT_WINDOW_MIN = 60;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = getClientIp(req);
  const admin = adminClient();

  try {
    const { username, password } = await req.json();
    if (!username || typeof password !== 'string') {
      return errorResponse('Usuário e senha são obrigatórios.', 400);
    }

    const cleanUsername = String(username).trim().toLowerCase();

    // Resolve o funcionário primeiro para aceitar os dois formatos:
    // username legado e e-mail usado no cadastro pelo onboarding.
    const { data: employeeRow } = await admin
      .from('employees')
      .select('*')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (!employeeRow) {
      return jsonResponse({ ok: false, code: 'not_employee' }, 404);
    }

    const rateIp = await checkRateLimit(admin, 'cozinha_login_ip', ip, RATE_LIMIT_MAX_PER_IP, RATE_LIMIT_WINDOW_MIN);
    if (!rateIp.allowed) {
      return errorResponse('Muitas tentativas de login. Tente novamente mais tarde.', 429);
    }
    const rateUser = await checkRateLimit(
      admin,
      'cozinha_login_user',
      cleanUsername,
      RATE_LIMIT_MAX_PER_USER,
      RATE_LIMIT_WINDOW_MIN,
    );
    if (!rateUser.allowed) {
      return errorResponse('Muitas tentativas de login. Tente novamente mais tarde.', 429);
    }

    if (!employeeRow.ativo) {
      return jsonResponse({ ok: false, message: 'Usuário ou senha inválidos.' }, 401);
    }

    if (employeeRow.establishment_id) {
      const { data: establishments, error: establishmentsError } = await admin
        .from('establishments')
        .select('id')
        .limit(2);
      if (establishmentsError || establishments?.length !== 1 || establishments[0].id !== employeeRow.establishment_id) {
        return jsonResponse({ ok: false, message: 'O acesso da cozinha deste estabelecimento ainda não está disponível.' }, 403);
      }
    }

    const authUserId = employeeRow.auth_user_id ?? employeeRow.id;
    const { data: authUserResult } = await admin.auth.admin.getUserById(authUserId);
    const email = authUserResult.user?.email ?? usernameToEmail(cleanUsername);

    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user || data.user.id !== authUserId) {
      return jsonResponse({ ok: false, message: 'Usuário ou senha inválidos.' }, 401);
    }

    const { password: _omit, ...safeEmployee } = employeeRow;

    return jsonResponse({
      ok: true,
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      employee: safeEmployee,
    });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao processar login.', 500);
  }
});
