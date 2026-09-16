// supabase/functions/promocoes/index.ts
//
// Substitui: GET/POST/PATCH/DELETE /promotions (Express)
// Leitura de promoções ativas já é pública via RLS direto (tabela `promotions`,
// policy "promocoes ativas visiveis publicamente"). Esta function cobre
// criar/editar/deletar e a listagem completa (inclusive inativas) para o
// painel da cozinha — todas exigem JWT de funcionário.
//
// Body esperado: { action: 'list' | 'create' | 'update' | 'delete', ... }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse, uid, requireEmployee } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await requireEmployee(req);
  if (!caller) return errorResponse('Não autenticado.', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'list') {
      const { data, error } = await supabase.from('promotions').select('*').order('created_at');
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'create') {
      const { nome, tipo, valor, productIds, ativo } = body;
      const { data, error } = await supabase
        .from('promotions')
        .insert({ id: uid(), nome, tipo, valor, product_ids: productIds ?? [], ativo: ativo !== false })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(data, 201);
    }

    if (action === 'update') {
      const { id, nome, tipo, valor, productIds, ativo } = body;
      const updates: Record<string, unknown> = {};
      if (nome != null) updates.nome = nome;
      if (tipo != null) updates.tipo = tipo;
      if (valor != null) updates.valor = valor;
      if (productIds != null) updates.product_ids = productIds;
      if (ativo != null) updates.ativo = ativo;

      const { data, error } = await supabase.from('promotions').update(updates).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse('Promoção não encontrada.', 404);
      return jsonResponse(data);
    }

    if (action === 'delete') {
      const { id } = body;
      const { error } = await supabase.from('promotions').delete().eq('id', id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao gerenciar promoções.', 500);
  }
});
