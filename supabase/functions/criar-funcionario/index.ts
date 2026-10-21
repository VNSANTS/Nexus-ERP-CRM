// supabase/functions/criar-funcionario/index.ts
//
// Passo 2 do onboarding (e também usável depois, fora do onboarding, para
// adicionar mais funcionários): o dono cria uma conta de funcionário com
// nome, e-mail, senha e permissões (cozinha / caixa / adm). Cria o usuário
// no Supabase Auth e o registro em `employees`, vinculado ao
// establishment_id do dono autenticado.
//
// Autenticação: Bearer token do dono (establishment_owners) OU de um
// funcionário com acesso_adm=true no mesmo estabelecimento.
//
// Body esperado: {
//   nome, email, senha,
//   acessoCozinha, acessoCaixa, acessoAdm
// }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Não autenticado.', 401);
  }
  const token = authHeader.slice('Bearer '.length);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return errorResponse('Sessão inválida ou expirada.', 401);
  }

  // Quem pode criar funcionário: o dono do estabelecimento, ou um
  // funcionário existente desse mesmo estabelecimento com acesso_adm.
  let establishmentId: string | null = null;

  const { data: owner } = await supabase
    .from('establishment_owners')
    .select('establishment_id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (owner) {
    establishmentId = owner.establishment_id;
  } else {
    const { data: adminEmployee } = await supabase
      .from('employees')
      .select('establishment_id')
      .eq('auth_user_id', userData.user.id)
      .eq('acesso_adm', true)
      .maybeSingle();
    if (adminEmployee) establishmentId = adminEmployee.establishment_id;
  }

  if (!establishmentId) {
    return errorResponse('Acesso negado.', 403);
  }

  try {
    const body = await req.json();
    const { nome, email, senha, acessoCozinha, acessoCaixa, acessoAdm } = body;

    if (!nome?.trim() || !email?.trim() || !senha) {
      return errorResponse('Nome, e-mail e senha são obrigatórios.', 400);
    }
    if (typeof senha !== 'string' || senha.length < 8) {
      return errorResponse('A senha deve ter pelo menos 8 caracteres.', 400);
    }
    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return errorResponse('E-mail inválido.', 400);
    }
    if (!acessoCozinha && !acessoCaixa && !acessoAdm) {
      return errorResponse('Selecione ao menos um tipo de acesso.', 400);
    }

    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: emailNorm,
      password: senha,
      email_confirm: true,
      user_metadata: { role: 'employee', establishmentId, nome: nome.trim() },
    });
    if (authErr) {
      if (authErr.message?.toLowerCase().includes('already registered')) {
        return errorResponse('Este e-mail já está em uso.', 409);
      }
      throw authErr;
    }

    const { error: empErr } = await supabase.from('employees').insert({
      id: authUser.user.id,
      establishment_id: establishmentId,
      auth_user_id: authUser.user.id,
      nome: nome.trim(),
      username: emailNorm,
      role: acessoAdm ? 'admin' : 'funcionario',
      acesso_cozinha: Boolean(acessoCozinha),
      acesso_caixa: Boolean(acessoCaixa),
      acesso_adm: Boolean(acessoAdm),
      ativo: true,
    });

    if (empErr) {
      // Reverte o usuário criado no Auth se o insert em employees falhar,
      // para não deixar uma conta "órfã" sem registro correspondente.
      await supabase.auth.admin.deleteUser(authUser.user.id).catch(() => {});
      throw empErr;
    }

    return jsonResponse({ ok: true, message: 'Funcionário criado com sucesso.', employeeId: authUser.user.id });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao criar funcionário.', 500);
  }
});
