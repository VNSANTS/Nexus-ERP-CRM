import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { adminClient } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return errorResponse('Não autenticado.', 401);
  const supabase = adminClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(auth.slice(7));
  if (authError || !authData.user) return errorResponse('Sessão inválida.', 401);
  const { data: platformAdmin } = await supabase.from('platform_admins').select('id').eq('id', authData.user.id).maybeSingle();
  if (!platformAdmin) return errorResponse('Acesso negado.', 403);

  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'dashboard') {
      const [total, complete, recent, orders] = await Promise.all([
        supabase.from('customer_accounts').select('id', { count: 'exact', head: true }),
        supabase.from('customer_accounts').select('id', { count: 'exact', head: true }).eq('cadastro_completo', true),
        supabase.from('customer_accounts').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
        supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);
      if (total.error || complete.error || recent.error || orders.error) throw total.error ?? complete.error ?? recent.error ?? orders.error;
      return jsonResponse({ total: total.count ?? 0, completos: complete.count ?? 0, novos30Dias: recent.count ?? 0, pedidos30Dias: orders.count ?? 0 });
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
    const { data, error } = await supabase.from('customer_accounts')
      .select('id,nome,email,telefone,cpf,cadastro_completo,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return jsonResponse(data ?? []);
  } catch (error) {
    console.error(error);
    return errorResponse('Não foi possível gerenciar os usuários.', 500);
  }
});
