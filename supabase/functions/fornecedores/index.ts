// supabase/functions/fornecedores/index.ts
//
// Substitui: GET/POST/PATCH/DELETE /suppliers e /suppliers/requests (Express)
// Requer JWT de funcionário.
//
// Body esperado: { action, ... }
//   - 'list' | 'create' | 'update' | 'delete' (fornecedores)
//   - 'list-requests' | 'create-request' | 'update-request-status' | 'delete-request' (solicitações)

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
    const now = new Date().toISOString();

    // -----------------------------------------------------------------
    // Fornecedores
    // -----------------------------------------------------------------
    if (action === 'list') {
      const { data, error } = await supabase.from('suppliers').select('*').order('created_at');
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'create') {
      const { nome, contato, telefone, email, insumos } = body;
      const { data, error } = await supabase
        .from('suppliers')
        .insert({ id: uid(), nome, contato, telefone, email, insumos, created_at: now, updated_at: now })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(data, 201);
    }

    if (action === 'update') {
      const { id, nome, contato, telefone, email, insumos } = body;
      const updates: Record<string, unknown> = { updated_at: now };
      if (nome != null) updates.nome = nome;
      if (contato != null) updates.contato = contato;
      if (telefone != null) updates.telefone = telefone;
      if (email != null) updates.email = email;
      if (insumos != null) updates.insumos = insumos;

      const { data, error } = await supabase.from('suppliers').update(updates).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse('Fornecedor não encontrado.', 404);
      return jsonResponse(data);
    }

    if (action === 'delete') {
      const { id } = body;
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------
    // Solicitações de suprimento
    // -----------------------------------------------------------------
    if (action === 'list-requests') {
      const { data, error } = await supabase.from('supply_requests').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'create-request') {
      const { supplierId, insumo, quantidade, observacoes } = body;
      const { data, error } = await supabase
        .from('supply_requests')
        .insert({
          id: uid(),
          supplier_id: supplierId,
          insumo,
          quantidade,
          observacoes: observacoes ?? '',
          status: 'pendente',
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(data, 201);
    }

    if (action === 'update-request-status') {
      const { id, status } = body;
      const { data, error } = await supabase
        .from('supply_requests')
        .update({ status, updated_at: now })
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse('Solicitação não encontrada.', 404);
      return jsonResponse(data);
    }

    if (action === 'delete-request') {
      const { id } = body;
      const { error } = await supabase.from('supply_requests').delete().eq('id', id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao gerenciar fornecedores.', 500);
  }
});
