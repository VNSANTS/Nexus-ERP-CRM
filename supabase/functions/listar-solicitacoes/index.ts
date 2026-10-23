// supabase/functions/listar-solicitacoes/index.ts
//
// Lista TODAS as solicitações de estabelecimento (pendentes, aprovadas,
// rejeitadas), para o Painel de Administração (/nxs). Substitui a antiga
// listar-solicitacoes-pendentes, que só trazia status='pendente' — o
// admin agora vê o histórico completo e pode agir em qualquer uma
// (inclusive bloquear uma já aprovada, se necessário).
//
// Só funciona para usuários que estejam na tabela platform_admins —
// qualquer outro token (ou nenhum) é rejeitado.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Não autenticado.', 401);
  }
  const token = authHeader.slice('Bearer '.length);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return errorResponse('Sessão inválida ou expirada.', 401);
  }

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!admin) {
    return errorResponse('Acesso negado.', 403);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('establishment_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao listar solicitações:', error);
      return errorResponse('Não foi possível carregar as solicitações.', 500);
    }

    return jsonResponse({ ok: true, solicitacoes: data ?? [] });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao listar solicitações.', 500);
  }
});
