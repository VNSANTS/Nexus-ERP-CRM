// supabase/functions/estoque/index.ts
//
// Substitui: POST /stock/:productId/entry, /waste, PATCH /minimo (Express)
// Todas as ações exigem JWT de funcionário.
//
// Body esperado: { action: 'entry' | 'waste' | 'set-minimo', productId, ... }

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
    const { action, productId } = body;

    if (action === 'entry' || action === 'waste') {
      const { quantidade, motivo } = body;
      if (!(quantidade > 0)) return errorResponse('Quantidade deve ser positiva.', 400);

      const { data: s } = await supabase.from('stock').select('*').eq('product_id', productId).maybeSingle();
      if (!s) return errorResponse('Item de estoque não encontrado.', 404);

      const now = new Date().toISOString();
      const newQty = action === 'entry' ? s.quantidade + quantidade : Math.max(0, s.quantidade - quantidade);

      await supabase.from('stock').update({ quantidade: newQty, updated_at: now }).eq('product_id', productId);

      const table = action === 'entry' ? 'stock_history' : 'waste_log';
      const { data: entry, error } = await supabase
        .from(table)
        .insert({ id: uid(), product_id: productId, product_name: s.name, quantidade, motivo, created_at: now })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(entry, 201);
    }

    if (action === 'set-minimo') {
      const { minimo } = body;
      const { data: updated, error } = await supabase
        .from('stock')
        .update({ minimo: Math.max(0, minimo), updated_at: new Date().toISOString() })
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
