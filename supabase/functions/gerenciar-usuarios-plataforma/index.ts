import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { adminClient } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return errorResponse('Não autenticado.', 401);
  const supabase = adminClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(auth.slice(7));
  if (authError || !authData.user) return errorResponse('Sessão inválida.', 401);
  const { data: platformAdmin } = await supabase.from('platform_admins').select('id,is_super_admin').eq('id', authData.user.id).maybeSingle();
  if (!platformAdmin) return errorResponse('Acesso negado.', 403);

  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'grant-super-admin' || body.action === 'revoke-super-admin') {
      if (platformAdmin.is_super_admin !== true) return errorResponse('Apenas o administrador superior pode alterar esse acesso.', 403);
      const targetId = typeof body.id === 'string' ? body.id : '';
      if (!targetId || targetId === authData.user.id) return errorResponse('Selecione outra conta para alterar.', 400);
      if (body.action === 'grant-super-admin') {
        const { error } = await supabase.from('platform_admins').upsert({ id: targetId, is_super_admin: true }, { onConflict: 'id' });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('platform_admins').update({ is_super_admin: false }).eq('id', targetId);
        if (error) throw error;
      }
      return jsonResponse({ ok: true });
    }
    if (body.action === 'dashboard') {
      const [authUsers, complete, recent, orders] = await Promise.all([
        supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabase.from('customer_accounts').select('id', { count: 'exact', head: true }).eq('cadastro_completo', true),
        supabase.from('customer_accounts').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
        supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);
      if (authUsers.error || complete.error || recent.error || orders.error) throw authUsers.error ?? complete.error ?? recent.error ?? orders.error;
      return jsonResponse({ total: authUsers.data.users.length, completos: complete.count ?? 0, novos30Dias: recent.count ?? 0, pedidos30Dias: orders.count ?? 0 });
    }
    if (body.action === 'delete') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!id) return errorResponse('Usuário inválido.', 400);
      const { data: account } = await supabase.from('customer_accounts').select('id').eq('id', id).maybeSingle();
      if (!account) return errorResponse('Usuário não encontrado.', 404);
      const { error: deleteError } = await supabase.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;
      return jsonResponse({ ok: true });
    }
    const [{ data: authUsers, error: usersError }, { data: profiles, error: profilesError }, { data: admins, error: adminsError }] = await Promise.all([
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabase.from('customer_accounts').select('id,nome,email,telefone,cpf,cadastro_completo,created_at,updated_at'),
      supabase.from('platform_admins').select('id,is_super_admin'),
    ]);
    if (usersError || profilesError || adminsError) throw usersError ?? profilesError ?? adminsError;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const adminById = new Map((admins ?? []).map((admin) => [admin.id, admin]));
    const rows = (authUsers?.users ?? []).map((user) => {
      const profile = profileById.get(user.id);
      const admin = adminById.get(user.id);
      return {
        id: user.id, nome: profile?.nome ?? user.user_metadata?.full_name ?? null,
        email: user.email ?? profile?.email ?? '', telefone: profile?.telefone ?? user.phone ?? null,
        cpf: profile?.cpf ?? null, cadastro_completo: profile?.cadastro_completo ?? false,
        created_at: profile?.created_at ?? user.created_at, is_platform_admin: !!admin,
        is_super_admin: admin?.is_super_admin === true,
      };
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return jsonResponse(rows);
  } catch (error) {
    console.error(error);
    return errorResponse('Não foi possível gerenciar os usuários.', 500);
  }
});
