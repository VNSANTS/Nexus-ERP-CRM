// supabase/functions/clientes/index.ts
//
// Substitui: GET/PUT/DELETE /customers, /customers/:tel/interactions (Express)
// Requer JWT de funcionário (dados de CRM não são públicos).
//
// Body esperado: { action, ... }
//   - 'list' | 'get' | 'upsert' | 'delete' (clientes)
//   - 'list-interactions' | 'add-interaction' (interações)
//   - 'list-loyalty' (fidelidade — também coberto por report-loyalty em gerenciar-dados,
//      mantido aqui também por conveniência de agrupamento de domínio)

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

    if (action === 'list') {
      const { data, error } = await supabase.from('customers').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'get') {
      const tel = String(body.telefone);
      const { data: customer } = await supabase.from('customers').select('*').eq('telefone', tel).maybeSingle();
      if (!customer) return errorResponse('Cliente não encontrado.', 404);
      const { data: interactions } = await supabase
        .from('customer_interactions')
        .select('*')
        .eq('telefone', tel)
        .order('created_at', { ascending: false });
      return jsonResponse({ ...customer, interactions: interactions ?? [] });
    }

    if (action === 'upsert') {
      const tel = String(body.telefone).trim();
      const { nome, tags, observacoes } = body;

      const { data: existing } = await supabase.from('customers').select('telefone').eq('telefone', tel).maybeSingle();

      if (existing) {
        const updates: Record<string, unknown> = { updated_at: now };
        if (nome != null) updates.nome = nome;
        if (tags != null) updates.tags = tags;
        if (observacoes != null) updates.observacoes = observacoes;
        const { data, error } = await supabase.from('customers').update(updates).eq('telefone', tel).select().single();
        if (error) throw error;
        return jsonResponse(data);
      }

      const { data, error } = await supabase
        .from('customers')
        .insert({ telefone: tel, nome: nome ?? '', tags: tags ?? [], observacoes: observacoes ?? '', created_at: now, updated_at: now })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(data, 201);
    }

    if (action === 'delete') {
      const { error } = await supabase.from('customers').delete().eq('telefone', String(body.telefone));
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    if (action === 'list-interactions') {
      const { data, error } = await supabase
        .from('customer_interactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'add-interaction') {
      const tel = String(body.telefone).trim();
      const { tipo, nota } = body;

      const { data: existing } = await supabase.from('customers').select('telefone').eq('telefone', tel).maybeSingle();
      if (!existing) {
        await supabase.from('customers').insert({ telefone: tel, nome: '', tags: [], observacoes: '', created_at: now, updated_at: now });
      }

      const { data, error } = await supabase
        .from('customer_interactions')
        .insert({ id: uid(), telefone: tel, tipo, nota: String(nota).trim(), created_at: now })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(data, 201);
    }

    if (action === 'list-loyalty') {
      const { data, error } = await supabase.from('loyalty').select('*');
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao gerenciar clientes.', 500);
  }
});
