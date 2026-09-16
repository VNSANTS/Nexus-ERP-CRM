// supabase/functions/cozinha-login/index.ts
//
// Substitui: POST /employees/login (Express)
// Usa o Supabase Auth nativo: cada funcionário é um usuário em auth.users,
// logado com um e-mail sintético derivado do username. O Supabase cuida do
// hashing de senha e da emissão/validação do token — não precisamos mais
// assinar nada manualmente.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse, adminClient, usernameToEmail } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { username, password } = await req.json();
    if (!username || typeof password !== 'string') {
      return errorResponse('Usuário e senha são obrigatórios.', 400);
    }

    // Cliente "público" (anon), só para fazer o login em si
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const email = usernameToEmail(username);
    const { data, error } = await anon.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      return jsonResponse({ ok: false, message: 'Usuário ou senha inválidos.' }, 401);
    }

    const meta = data.user.user_metadata as Record<string, unknown>;

    // Confirma que o usuário está marcado como ativo na nossa tabela de negócio
    const admin = adminClient();
    const { data: employeeRow } = await admin
      .from('employees')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!employeeRow || !employeeRow.ativo) {
      return jsonResponse({ ok: false, message: 'Funcionário inativo ou não encontrado.' }, 401);
    }

    const { password: _omit, ...safeEmployee } = employeeRow;

    return jsonResponse({
      ok: true,
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      employee: { ...safeEmployee, nome: meta.nome ?? safeEmployee.nome, role: meta.role ?? safeEmployee.role },
    });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao processar login.', 500);
  }
});
