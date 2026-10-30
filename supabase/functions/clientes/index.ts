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
import { corsHeaders, jsonResponse, errorResponse, uid, requireEmployee, hasEmployeeAccess, hasFeatureAccess } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await requireEmployee(req);
  if (!caller) return errorResponse('Não autenticado.', 401);

  if (!hasFeatureAccess(caller, 'crm')) return errorResponse('Acesso restrito ao CRM.', 403);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const { action } = body;
    const now = new Date().toISOString();

    if (action === 'list') {
      const { data, error } = await supabase.from('customers').select('*').eq('establishment_id', caller.establishmentId).order('updated_at', { ascending: false });
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'insights') {
      const { data, error } = await supabase.rpc('customer_insights', {
        p_establishment_id: caller.establishmentId,
      });
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'get') {
      const tel = String(body.telefone);
      const { data: customer } = await supabase.from('customers').select('*').eq('establishment_id', caller.establishmentId).eq('telefone', tel).maybeSingle();
      if (!customer) return errorResponse('Cliente não encontrado.', 404);
      const { data: interactions } = await supabase
        .from('customer_interactions')
        .select('*')
        .eq('establishment_id', caller.establishmentId)
        .eq('telefone', tel)
        .order('created_at', { ascending: false });
      return jsonResponse({ ...customer, interactions: interactions ?? [] });
    }

    if (action === 'upsert') {
      const tel = String(body.telefone).trim();
      const { nome, tags, observacoes } = body;
      if (!tel || tel.length > 30) return errorResponse('Telefone inválido.', 400);
      if (nome != null && (typeof nome !== 'string' || nome.length > 120)) return errorResponse('Nome inválido.', 400);
      if (observacoes != null && (typeof observacoes !== 'string' || observacoes.length > 2000)) return errorResponse('Observações excedem o limite.', 400);
      if (tags != null && (!Array.isArray(tags) || tags.length > 20 || tags.some((tag) => typeof tag !== 'string' || tag.length > 40))) {
        return errorResponse('Etiquetas inválidas.', 400);
      }

      const values: Record<string, unknown> = {
        establishment_id: caller.establishmentId,
        telefone: tel,
        updated_at: now,
      };
      if (nome != null) values.nome = nome.trim();
      if (tags != null) values.tags = tags.map((tag: string) => tag.trim()).filter(Boolean);
      if (observacoes != null) values.observacoes = observacoes.trim();

      const { data, error } = await supabase.from('customers')
        .upsert(values, { onConflict: 'establishment_id,telefone' })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(data);
    }

    if (action === 'delete') {
      const { error } = await supabase.from('customers').delete().eq('establishment_id', caller.establishmentId).eq('telefone', String(body.telefone));
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    if (action === 'list-interactions') {
      const { data, error } = await supabase
        .from('customer_interactions')
        .select('*')
        .eq('establishment_id', caller.establishmentId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'add-interaction') {
      const tel = String(body.telefone).trim();
      const { tipo, nota } = body;
      if (!tel || tel.length > 30) return errorResponse('Telefone inválido.', 400);
      if (typeof tipo !== 'string' || !['ligacao', 'whatsapp', 'presencial', 'email', 'outro'].includes(tipo)) return errorResponse('Tipo de interação inválido.', 400);
      if (typeof nota !== 'string' || !nota.trim() || nota.length > 2000) return errorResponse('Descreva a interação em até 2.000 caracteres.', 400);

      const { error: customerError } = await supabase.from('customers').upsert({
        establishment_id: caller.establishmentId, telefone: tel, nome: '', tags: [], observacoes: '',
      }, { onConflict: 'establishment_id,telefone', ignoreDuplicates: true });
      if (customerError) throw customerError;

      const { data, error } = await supabase
        .from('customer_interactions')
        .insert({ establishment_id: caller.establishmentId, id: uid(), telefone: tel, tipo, nota: nota.trim(), created_at: now })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(data, 201);
    }

    if (action === 'list-loyalty') {
      const { data, error } = await supabase.from('loyalty').select('*').eq('establishment_id', caller.establishmentId);
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao gerenciar clientes.', 500);
  }
});
