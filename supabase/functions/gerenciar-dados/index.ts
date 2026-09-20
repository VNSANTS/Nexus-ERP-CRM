// supabase/functions/gerenciar-dados/index.ts
//
// Cobre as operações que não são CRUD simples o bastante pra ir direto por
// RLS: criação de produto (precisa também criar a linha em `stock`),
// relatórios agregados (leem tabelas sem policy de leitura pública), e a
// limpeza de vendas do dia. Exige JWT de funcionário.
//
// Body esperado: { action: '...', ... }
//   - 'create-product' | 'update-product' | 'delete-product'
//   - 'report-daily' | 'report-products' | 'report-hourly' |
//     'report-transactions' | 'report-waste' | 'report-loyalty' | 'report-stock-history'
//   - 'clear-sales'

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse, requireEmployee } from '../_shared/helpers.ts';

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

    // -----------------------------------------------------------------
    // Produtos
    // -----------------------------------------------------------------
    if (action === 'create-product') {
      const { id, name, price, emoji, categoria, sazonal, disponivel, imageUrl } = body;
      if (!id || !name || price == null || !emoji || !categoria) {
        return errorResponse('Campos obrigatórios ausentes.', 400);
      }
      const { data: product, error } = await supabase
        .from('products')
        .insert({ id, name, price, emoji, categoria, sazonal: !!sazonal, disponivel: disponivel !== false, image_url: imageUrl ?? null })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('stock').upsert({ product_id: id, name, quantidade: 0, minimo: 5 }, { onConflict: 'product_id', ignoreDuplicates: true });

      return jsonResponse(product, 201);
    }

    if (action === 'update-product') {
      const { id, name, price, emoji, categoria, sazonal, disponivel, imageUrl } = body;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name != null) updates.name = name;
      if (price != null) updates.price = price;
      if (emoji != null) updates.emoji = emoji;
      if (categoria != null) updates.categoria = categoria;
      if (sazonal != null) updates.sazonal = sazonal;
      if (disponivel != null) updates.disponivel = disponivel;
      if (imageUrl !== undefined) updates.image_url = imageUrl;

      const { data: updated, error } = await supabase.from('products').update(updates).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!updated) return errorResponse('Produto não encontrado.', 404);

      if (name != null) {
        await supabase.from('stock').update({ name }).eq('product_id', id);
      }
      return jsonResponse(updated);
    }

    if (action === 'delete-product') {
      const { id } = body;
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------
    // Relatórios
    // -----------------------------------------------------------------
    if (action === 'report-daily') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayOrders } = await supabase.from('orders').select('*').gte('created_at', todayStart.toISOString());
      const valid = (todayOrders ?? []).filter((o) => o.status !== 'cancelado');

      const totalVendas = valid.reduce((s, o) => s + Number(o.total), 0);
      const quantidadePedidos = valid.length;
      const ticketMedio = quantidadePedidos > 0 ? totalVendas / quantidadePedidos : 0;

      const byMethod: Record<string, number> = {};
      for (const o of valid) byMethod[o.payment_method] = (byMethod[o.payment_method] ?? 0) + Number(o.total);

      return jsonResponse({ totalVendas, quantidadePedidos, ticketMedio, byMethod });
    }

    if (action === 'report-products') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayOrders } = await supabase.from('orders').select('id, status').gte('created_at', todayStart.toISOString());
      const validIds = (todayOrders ?? []).filter((o) => o.status !== 'cancelado').map((o) => o.id);
      if (!validIds.length) return jsonResponse([]);

      const { data: items } = await supabase.from('order_items').select('*').in('order_id', validIds);
      const map = new Map<string, { productId: string; name: string; qty: number; total: number }>();
      for (const item of items ?? []) {
        const e = map.get(item.product_id) ?? { productId: item.product_id, name: item.name, qty: 0, total: 0 };
        e.qty += item.qty;
        e.total += Number(item.price) * item.qty;
        map.set(item.product_id, e);
      }
      return jsonResponse(Array.from(map.values()).sort((a, b) => b.qty - a.qty));
    }

    if (action === 'report-hourly') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayOrders } = await supabase.from('orders').select('status, created_at').gte('created_at', todayStart.toISOString());
      const valid = (todayOrders ?? []).filter((o) => o.status !== 'cancelado');

      const buckets = new Map<number, number>();
      for (const o of valid) {
        const hour = new Date(o.created_at).getHours();
        buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
      }
      return jsonResponse(
        Array.from(buckets.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([hour, count]) => ({ hour, label: `${String(hour).padStart(2, '0')}h`, count })),
      );
    }

    if (action === 'report-transactions') {
      const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(500);
      return jsonResponse(data ?? []);
    }

    if (action === 'report-waste') {
      const { data: rows } = await supabase.from('waste_log').select('*').order('created_at', { ascending: false });
      const map = new Map<string, { productId: string; productName: string; quantidade: number }>();
      for (const e of rows ?? []) {
        const r = map.get(e.product_id) ?? { productId: e.product_id, productName: e.product_name, quantidade: 0 };
        r.quantidade += e.quantidade;
        map.set(e.product_id, r);
      }
      return jsonResponse({ summary: Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade), log: rows ?? [] });
    }

    if (action === 'report-stock-history') {
      const { data, error } = await supabase.from('stock_history').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'report-loyalty') {
      const { data } = await supabase.from('loyalty').select('*');
      return jsonResponse(data ?? []);
    }

    if (action === 'clear-sales') {
      if (caller.employeeRole !== 'admin') return errorResponse('Apenas administradores podem limpar vendas.', 403);
      await supabase.from('orders').delete().neq('id', '');
      await supabase.from('transactions').delete().neq('id', '');
      await supabase.from('waste_log').delete().neq('id', '');
      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------
    // Configurações da loja (leitura já é pública via RLS; escrita exige admin)
    // -----------------------------------------------------------------
    if (action === 'update-settings') {
      if (caller.employeeRole !== 'admin') return errorResponse('Apenas administradores podem alterar configurações.', 403);
      const { nomeLoja, whatsappNumero } = body;
      const updates: Record<string, unknown> = {};
      if (nomeLoja != null) updates.nome_loja = nomeLoja;
      if (whatsappNumero != null) updates.whatsapp_numero = whatsappNumero;

      const { data, error } = await supabase.from('settings').update(updates).eq('id', 1).select().maybeSingle();
      if (error) throw error;
      return jsonResponse(data);
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno.', 500);
  }
});
