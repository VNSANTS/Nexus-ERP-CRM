// supabase/functions/gerenciar-funcionarios/index.ts
//
// Substitui: GET/POST/PATCH/DELETE /employees (Express)
// Requer sessão de funcionário. Criar/editar/deletar exige role 'admin'.
// Usa a Auth Admin API do Supabase para criar/atualizar/apagar o usuário —
// a senha nunca passa pela nossa tabela `employees`.
//
// Body esperado: { action: 'list' | 'create' | 'update' | 'delete', ... }

import { corsHeaders, jsonResponse, errorResponse, requireEmployee, adminClient, usernameToEmail, hasEmployeeAccess } from '../_shared/helpers.ts';

function validAccess(role: string, cozinha: boolean, caixa: boolean, adm: boolean): boolean {
  if (![cozinha, caixa, adm].every((value) => typeof value === 'boolean')) return false;
  if (role === 'admin') return cozinha && caixa && adm;
  return role === 'funcionario' && (cozinha || caixa) && !adm;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await requireEmployee(req);
  if (!caller) return errorResponse('Não autenticado.', 401);

  if (!hasEmployeeAccess(caller, 'adm')) return errorResponse('Acesso restrito a administracao.', 403);

  const supabase = adminClient();

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'list') {
      const { data, error } = await supabase.from('employees').select('*').eq('establishment_id', caller.establishmentId).order('created_at');
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    // Ações abaixo exigem admin
    if (!hasEmployeeAccess(caller, 'adm')) {
      return errorResponse('Apenas administradores podem gerenciar funcionários.', 403);
    }

    if (action === 'create') {
      const { nome, username, password, role, horario, ativo, acessoCozinha, acessoCaixa, acessoAdm } = body;
      if (!nome || !username || typeof password !== 'string' || password.length < 8) {
        return errorResponse('Nome, usuário e senha com pelo menos 8 caracteres são obrigatórios.', 400);
      }

      if (!validAccess(role ?? 'funcionario', acessoCozinha, acessoCaixa, acessoAdm)) {
        return errorResponse('Permissoes invalidas para o cargo selecionado.', 400);
      }

      const cleanUsername = String(username).trim().toLowerCase();
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: usernameToEmail(cleanUsername),
        password,
        email_confirm: true,
        user_metadata: { nome, username: cleanUsername, role: role ?? 'funcionario' },
      });
      if (authErr) {
        if (authErr.message?.toLowerCase().includes('already')) {
          return errorResponse('Já existe um funcionário com esse usuário.', 409);
        }
        throw authErr;
      }

      const { data: employee, error } = await supabase
        .from('employees')
        .insert({
          id: authUser.user.id,
          nome,
          username: cleanUsername,
          role: role ?? 'funcionario',
          horario: horario ?? '',
          ativo: ativo !== false,
          establishment_id: caller.establishmentId,
          acesso_cozinha: acessoCozinha,
          acesso_caixa: acessoCaixa,
          acesso_adm: acessoAdm,
        })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(employee, 201);
    }

    if (action === 'update') {
      const { id, nome, username, password, role, horario, ativo, acessoCozinha, acessoCaixa, acessoAdm } = body;
      if (!id) return errorResponse('id é obrigatório.', 400);

      const { data: target, error: targetError } = await supabase
        .from('employees')
        .select('id, auth_user_id, role, ativo, acesso_cozinha, acesso_caixa, acesso_adm')
        .eq('establishment_id', caller.establishmentId)
        .eq('id', id)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return errorResponse('Employee not found.', 404);
      const nextRole = role ?? target.role;
      const nextKitchen = acessoCozinha ?? target.acesso_cozinha;
      const nextCashier = acessoCaixa ?? target.acesso_caixa;
      const nextAdmin = acessoAdm ?? target.acesso_adm;
      if (!validAccess(nextRole, nextKitchen, nextCashier, nextAdmin)) {
        return errorResponse('Permissoes invalidas para o cargo selecionado.', 400);
      }
      if (target.acesso_adm && (!nextAdmin || ativo === false)) {
        const { data: activeAdmins, error: activeAdminsError } = await supabase.from('employees')
          .select('id').eq('establishment_id', caller.establishmentId).eq('ativo', true).eq('acesso_adm', true);
        if (activeAdminsError) throw activeAdminsError;
        if ((activeAdmins ?? []).length <= 1) return errorResponse('Mantenha pelo menos um administrador ativo.', 409);
      }
      const authUserId = target.auth_user_id ?? target.id;

      // Atualiza no Auth (senha, e-mail derivado do username, metadata)
      const authUpdates: Record<string, unknown> = {};
      const metaUpdates: Record<string, unknown> = {};
      if (password != null && password !== '') {
        if (password.length < 8) return errorResponse('A senha deve ter pelo menos 8 caracteres.', 400);
        authUpdates.password = password;
      }
      if (username != null) {
        const cleanUsername = String(username).trim().toLowerCase();
        authUpdates.email = usernameToEmail(cleanUsername);
        metaUpdates.username = cleanUsername;
      }
      if (nome != null) metaUpdates.nome = nome;
      if (role != null) metaUpdates.role = role;

      if (Object.keys(authUpdates).length || Object.keys(metaUpdates).length) {
        const { error: authErr } = await supabase.auth.admin.updateUserById(authUserId, {
          ...authUpdates,
          ...(Object.keys(metaUpdates).length ? { user_metadata: metaUpdates } : {}),
        });
        if (authErr) throw authErr;
      }

      // Atualiza na tabela de negócio
      const updates: Record<string, unknown> = {};
      if (nome != null) updates.nome = nome;
      if (username != null) updates.username = String(username).trim().toLowerCase();
      if (role != null) updates.role = role;
      if (horario != null) updates.horario = horario;
      if (ativo != null) updates.ativo = ativo;
      if (acessoCozinha != null) updates.acesso_cozinha = acessoCozinha;
      if (acessoCaixa != null) updates.acesso_caixa = acessoCaixa;
      if (acessoAdm != null) updates.acesso_adm = acessoAdm;

      const { data, error } = await supabase.from('employees').update(updates).eq('establishment_id', caller.establishmentId).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse('Funcionário não encontrado.', 404);
      return jsonResponse(data);
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return errorResponse('id é obrigatório.', 400);

      const { data: target, error: targetError } = await supabase
        .from('employees').select('id, auth_user_id, role, ativo, acesso_adm')
        .eq('establishment_id', caller.establishmentId).eq('id', id).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return errorResponse('Employee not found.', 404);

      const { data: allAdmins, error: adminsErr } = await supabase.from('employees').select('id, ativo').eq('establishment_id', caller.establishmentId).eq('acesso_adm', true);
      if (adminsErr) throw adminsErr;

      const activeAdmins = (allAdmins ?? []).filter((e) => e.ativo);
      if (target.acesso_adm && target.ativo && activeAdmins.length <= 1) {
        return jsonResponse({ ok: false, message: 'É preciso manter ao menos um administrador ativo.' }, 400);
      }

      // Apagar o usuário do Auth já remove a linha em employees via ON DELETE CASCADE
      const { error } = await supabase.auth.admin.deleteUser(target.auth_user_id ?? target.id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao gerenciar funcionários.', 500);
  }
});
