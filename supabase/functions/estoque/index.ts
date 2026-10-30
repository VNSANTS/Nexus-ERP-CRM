// supabase/functions/estoque/index.ts
//
// Substitui: POST /stock/:productId/entry, /waste, PATCH /minimo (Express)
// Todas as ações exigem JWT de funcionário.
//
// Body esperado: { action: 'entry' | 'waste' | 'set-minimo', productId, ... }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse, uid, requireEmployee, hasEmployeeAccess, hasFeatureAccess } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await requireEmployee(req);
  if (!caller) return errorResponse('Não autenticado.', 401);

  if (!hasFeatureAccess(caller, 'estoque')) {
    return errorResponse('Acesso restrito.', 403);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const { action, productId } = body;
    if (typeof productId !== 'string' || !productId.trim()) return errorResponse('Informe o produto.', 400);

    if (action === 'entry' || action === 'waste') {
      const { quantidade, motivo } = body;
      if (!Number.isSafeInteger(quantidade) || quantidade <= 0) return errorResponse('Quantidade deve ser um inteiro positivo.', 400);

      const { data: s, error: selectError } = await supabase.from('stock').select('*').eq('establishment_id', caller.establishmentId).eq('product_id', productId).maybeSingle();
      if (selectError) throw selectError;
      if (!s) return errorResponse('Item de estoque não encontrado.', 404);

      if (quantidade > 2_147_483_647 || (action === 'entry' && s.quantidade + quantidade > 2_147_483_647)) {
        return errorResponse('Quantidade excede o limite de estoque.', 400);
      }
      if (action === 'waste' && quantidade > s.quantidade) {
        return errorResponse('Desperdicio nao pode exceder o estoque disponivel.', 409);
      }

      const now = new Date().toISOString();
      const newQty = action === 'entry' ? s.quantidade + quantidade : s.quantidade - quantidade;

      const { error: updateError } = await supabase.from('stock').update({ quantidade: newQty, updated_at: now }).eq('establishment_id', caller.establishmentId).eq('product_id', productId);
      if (updateError) throw updateError;

      const table = action === 'entry' ? 'stock_history' : 'waste_log';
      const { data: entry, error } = await supabase
        .from(table)
        .insert({ establishment_id: caller.establishmentId, id: uid(), product_id: productId, product_name: s.name, quantidade, motivo: String(motivo ?? '').trim(), created_at: now })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(entry, 201);
    }

    if (action === 'set-minimo') {
      const { minimo } = body;
      if (!Number.isSafeInteger(minimo) || minimo < 0 || minimo > 2_147_483_647) return errorResponse('Estoque minimo invalido.', 400);
      const { data: updated, error } = await supabase
        .from('stock')
        .update({ minimo, updated_at: new Date().toISOString() })
        .eq('establishment_id', caller.establishmentId)
        .eq('product_id', productId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!updated) return errorResponse('Item de estoque não encontrado.', 404);
      return jsonResponse(updated);
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao gerenciar estoque.', 500);
  }
});
