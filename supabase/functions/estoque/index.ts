// supabase/functions/estoque/index.ts
//
// Substitui: POST /stock/:productId/entry, /waste, PATCH /minimo (Express)
// Todas as ações exigem JWT de funcionário.
//
// Body esperado: { action: 'entry' | 'waste' | 'set-minimo', productId, ... }

import { withCors } from '../_shared/helpers.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse, requireEmployee, hasFeatureAccess } from '../_shared/helpers.ts';

Deno.serve((req: Request) => withCors(req, async () => {
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

      if (quantidade > 2_147_483_647 || String(motivo ?? '').length > 500) {
        return errorResponse('Quantidade ou motivo excede o limite.', 400);
      }
      const { data: entry, error } = await supabase.rpc('move_inventory_atomic', {
        p_establishment_id: caller.establishmentId, p_product_id: productId,
        p_action: action, p_quantity: quantidade, p_reason: String(motivo ?? ''),
      });
      if (error) {
        if (error.code === 'P0002') return errorResponse('Item de estoque não encontrado.', 404);
        if (error.message === 'STOCK_INSUFFICIENT') return errorResponse('Desperdício não pode exceder o estoque disponível.', 409);
        if (error.code === '22023') return errorResponse('Movimentação de estoque inválida.', 400);
        throw error;
      }
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
}));
