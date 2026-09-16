// supabase/functions/gerenciar-funcionarios/index.ts
//
// Substitui: GET/POST/PATCH/DELETE /employees (Express)
// Requer sessão de funcionário. Criar/editar/deletar exige role 'admin'.
// Usa a Auth Admin API do Supabase para criar/atualizar/apagar o usuário —
// a senha nunca passa pela nossa tabela `employees`.
//
// Body esperado: { action: 'list' | 'create' | 'update' | 'delete', ... }

import { corsHeaders, jsonResponse, errorResponse, requireEmployee, adminClient, usernameToEmail } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await requireEmployee(req);
  if (!caller) return errorResponse('Não autenticado.', 401);

  const supabase = adminClient();

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'list') {
      const { data, error } = await supabase.from('employees').select('*').order('created_at');
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    // Ações abaixo exigem admin
    if (caller.employeeRole !== 'admin') {
      return errorResponse('Apenas administradores podem gerenciar funcionários.', 403);
    }

    if (action === 'create') {
      const { nome, username, password, role, horario, ativo } = body;
      if (!nome || !username || typeof password !== 'string' || password.length < 6) {
        return errorResponse('Nome, usuário e senha com pelo menos 6 caracteres são obrigatórios.', 400);
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
        })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(employee, 201);
    }

    if (action === 'update') {
      const { id, nome, username, password, role, horario, ativo } = body;
      if (!id) return errorResponse('id é obrigatório.', 400);

      // Atualiza no Auth (senha, e-mail derivado do username, metadata)
      const authUpdates: Record<string, unknown> = {};
      const metaUpdates: Record<string, unknown> = {};
      if (password != null && password !== '') {
        if (password.length < 6) return errorResponse('A senha deve ter pelo menos 6 caracteres.', 400);
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
        const { error: authErr } = await supabase.auth.admin.updateUserById(id, {
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

      const { data, error } = await supabase.from('employees').update(updates).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse('Funcionário não encontrado.', 404);
      return jsonResponse(data);
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return errorResponse('id é obrigatório.', 400);

      const { data: allAdmins, error: adminsErr } = await supabase.from('employees').select('id, ativo').eq('role', 'admin');
      if (adminsErr) throw adminsErr;

      const target = allAdmins?.find((e) => e.id === id);
      const activeAdmins = (allAdmins ?? []).filter((e) => e.ativo);
      if (target && activeAdmins.length <= 1) {
        return jsonResponse({ ok: false, message: 'É preciso manter ao menos um administrador ativo.' }, 400);
      }

      // Apagar o usuário do Auth já remove a linha em employees via ON DELETE CASCADE
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao gerenciar funcionários.', 500);
  }
});
