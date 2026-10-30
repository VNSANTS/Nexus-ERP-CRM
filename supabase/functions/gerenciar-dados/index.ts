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
import { corsHeaders, jsonResponse, errorResponse, requireEmployee, hasEmployeeAccess } from '../_shared/helpers.ts';
import { checkRateLimit } from '../_shared/security.ts';

function saoPauloDayStart(now = new Date()): Date {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
  const localMidnightAsUtc = Date.UTC(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day));
  const midnightParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(localMidnightAsUtc)).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
  const representedLocalAsUtc = Date.UTC(
    Number(midnightParts.year), Number(midnightParts.month) - 1, Number(midnightParts.day),
    Number(midnightParts.hour), Number(midnightParts.minute), Number(midnightParts.second),
  );
  return new Date(localMidnightAsUtc - (representedLocalAsUtc - localMidnightAsUtc));
}

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
    const financeiro = ['report-daily', 'report-transactions', 'confirm-transaction'].includes(action);
    if (financeiro) {
      if (!hasEmployeeAccess(caller, 'caixa') && !hasEmployeeAccess(caller, 'adm')) {
        return errorResponse('Acesso restrito ao caixa ou à administração.', 403);
      }
    } else if (['list-products', 'list-stock', 'get-settings', 'report-products', 'report-hourly'].includes(action)) {
      if (!hasEmployeeAccess(caller, 'cozinha') && !hasEmployeeAccess(caller, 'caixa') && !hasEmployeeAccess(caller, 'adm')) {
        return errorResponse('Acesso restrito a cozinha ou caixa.', 403);
      }
    } else if (!hasEmployeeAccess(caller, 'adm')) {
      return errorResponse('Acesso restrito à administração.', 403);
    }

    if (action === 'create-product-image-upload') {
      const { productId, contentType, size } = body;
      if (typeof productId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(productId)) {
        return errorResponse('Identificador de produto inválido.', 400);
      }
      if (contentType !== 'image/webp' || !Number.isInteger(size) || size < 1 || size > 5 * 1024 * 1024) {
        return errorResponse('A imagem deve ser WebP e ter no máximo 5 MB.', 400);
      }
      const uploadRate = await checkRateLimit(supabase, 'product_image_upload', caller.employeeId, 30, 60);
      if (!uploadRate.allowed) return errorResponse('Limite de envios de imagem atingido. Tente novamente mais tarde.', 429);
      const path = `${caller.establishmentId}/products/${productId}/${crypto.randomUUID()}.webp`;
      const { data, error } = await supabase.storage.from('product-images').createSignedUploadUrl(path, { upsert: false });
      if (error || !data) throw error ?? new Error('Não foi possível criar o envio.');
      return jsonResponse({ path: data.path, token: data.token });
    }

    // -----------------------------------------------------------------
    if (action === 'list-products') {
      const { data, error } = await supabase.from('products')
        .select('*')
        .eq('establishment_id', caller.establishmentId)
        .order('name');
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'list-stock') {
      const { data, error } = await supabase.from('stock')
        .select('*')
        .eq('establishment_id', caller.establishmentId)
        .order('name');
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'get-settings') {
      const { data, error } = await supabase.from('settings')
        .select('*')
        .eq('establishment_id', caller.establishmentId)
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse('Configurações do estabelecimento não encontradas.', 404);
      return jsonResponse(data);
    }

    // Produtos
    // -----------------------------------------------------------------
    if (action === 'create-product') {
      const { id, name, price, emoji, categoria, sazonal, disponivel, imageUrl, quantidadeInicial } = body;
      if (!id || !name || price == null || !categoria || (!emoji && !imageUrl)) {
        return errorResponse('Nome, preço, categoria e (emoji ou foto) são obrigatórios.', 400);
      }
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)
        || typeof name !== 'string' || name.trim().length > 120
        || !Number.isFinite(Number(price)) || Number(price) < 0
        || typeof categoria !== 'string' || categoria.trim().length > 80) {
        return errorResponse('Dados do produto inválidos.', 400);
      }
      const initialQuantity = quantidadeInicial == null ? 0 : Number(quantidadeInicial);
      if (!Number.isFinite(initialQuantity) || initialQuantity < 0 || initialQuantity > 1_000_000) {
        return errorResponse('Quantidade inicial inválida.', 400);
      }
      const { data: product, error } = await supabase
        .from('products')
        .insert({ id, establishment_id: caller.establishmentId, name: name.trim(), price: Number(price), emoji: emoji ?? '', categoria: categoria.trim(), sazonal: !!sazonal, disponivel: disponivel !== false, image_url: imageUrl ?? null })
        .select()
        .single();
      if (error) throw error;

      const { error: stockError } = await supabase.from('stock').upsert({ establishment_id: caller.establishmentId, product_id: id, name: name.trim(), quantidade: initialQuantity, minimo: 5 }, { onConflict: 'establishment_id,product_id', ignoreDuplicates: true });
      if (stockError) {
        const { error: rollbackError } = await supabase.from('products').delete()
          .eq('establishment_id', caller.establishmentId).eq('id', id);
        if (rollbackError) console.error('Falha ao reverter produto sem estoque inicial:', rollbackError);
        throw stockError;
      }

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

      const { data: updated, error } = await supabase.from('products').update(updates).eq('establishment_id', caller.establishmentId).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!updated) return errorResponse('Produto não encontrado.', 404);

      if (name != null) {
        const { error: stockError } = await supabase.from('stock').update({ name }).eq('establishment_id', caller.establishmentId).eq('product_id', id);
        if (stockError) throw stockError;
      }
      return jsonResponse(updated);
    }

    if (action === 'delete-product') {
      const { id } = body;
      const { error } = await supabase.from('products').delete().eq('establishment_id', caller.establishmentId).eq('id', id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------
    // Relatórios
    // -----------------------------------------------------------------
    if (action === 'report-daily') {
      const todayStart = saoPauloDayStart();
      const [{ data: todayOrders }, { data: todayTransactions }] = await Promise.all([
        supabase.from('orders').select('id, total, status, created_at').eq('establishment_id', caller.establishmentId).gte('created_at', todayStart.toISOString()),
        supabase.from('transactions').select('valor, method, status').eq('establishment_id', caller.establishmentId).gte('created_at', todayStart.toISOString()),
      ]);
      const valid = (todayOrders ?? []).filter((o) => o.status !== 'cancelado');
      const confirmedTransactions = (todayTransactions ?? []).filter((transaction) => transaction.status === 'confirmado');
      const pendingTransactions = (todayTransactions ?? []).filter((transaction) => transaction.status === 'pendente');
      const totalVendas = confirmedTransactions.reduce((sum, transaction) => sum + Number(transaction.valor), 0);
      const totalPendente = pendingTransactions.reduce((sum, transaction) => sum + Number(transaction.valor), 0);
      const quantidadePedidos = valid.length;
      const ticketMedio = confirmedTransactions.length > 0 ? totalVendas / confirmedTransactions.length : 0;

      const byMethod: Record<string, number> = {};
      for (const transaction of confirmedTransactions) {
        byMethod[transaction.method] = (byMethod[transaction.method] ?? 0) + Number(transaction.valor);
      }

      return jsonResponse({ totalVendas, totalPendente, pagamentosPendentes: pendingTransactions.length, quantidadePedidos, ticketMedio, byMethod });
    }

    if (action === 'report-products') {
      const todayStart = saoPauloDayStart();
      const { data: todayOrders } = await supabase.from('orders').select('id, status').eq('establishment_id', caller.establishmentId).gte('created_at', todayStart.toISOString());
      const validIds = (todayOrders ?? []).filter((o) => o.status !== 'cancelado').map((o) => o.id);
      if (!validIds.length) return jsonResponse([]);

      const { data: items } = await supabase.from('order_items').select('*').eq('establishment_id', caller.establishmentId).in('order_id', validIds);
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
      const todayStart = saoPauloDayStart();
      const { data: todayOrders } = await supabase.from('orders').select('status, created_at').eq('establishment_id', caller.establishmentId).gte('created_at', todayStart.toISOString());
      const valid = (todayOrders ?? []).filter((o) => o.status !== 'cancelado');

      const buckets = new Map<number, number>();
      for (const o of valid) {
        const hour = Number(new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date(o.created_at)).find((part) => part.type === 'hour')?.value ?? 0);
        buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
      }
      return jsonResponse(
        Array.from(buckets.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([hour, count]) => ({ hour, label: `${String(hour).padStart(2, '0')}h`, count })),
      );
    }

    if (action === 'report-transactions') {
      const { data } = await supabase.from('transactions').select('*').eq('establishment_id', caller.establishmentId).order('created_at', { ascending: false }).limit(500);
      return jsonResponse(data ?? []);
    }

    if (action === 'confirm-transaction') {
      if (!hasEmployeeAccess(caller, 'adm') && !hasEmployeeAccess(caller, 'caixa')) return errorResponse('Acesso restrito ao caixa ou a administracao.', 403);
      const { id } = body;
      if (!id) return errorResponse('id é obrigatório.', 400);
      const { data, error } = await supabase
        .from('transactions')
        .update({ status: 'confirmado' })
        .eq('establishment_id', caller.establishmentId)
        .eq('id', id)
        .eq('status', 'pendente')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse('Pagamento pendente não encontrado. Atualize a lista.', 409);
      return jsonResponse({ ok: true });
    }

    if (action === 'report-waste') {
      const { data: rows } = await supabase.from('waste_log').select('*').eq('establishment_id', caller.establishmentId).order('created_at', { ascending: false });
      const map = new Map<string, { productId: string; productName: string; quantidade: number }>();
      for (const e of rows ?? []) {
        const r = map.get(e.product_id) ?? { productId: e.product_id, productName: e.product_name, quantidade: 0 };
        r.quantidade += e.quantidade;
        map.set(e.product_id, r);
      }
      return jsonResponse({ summary: Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade), log: rows ?? [] });
    }

    if (action === 'report-stock-history') {
      const { data, error } = await supabase.from('stock_history').select('*').eq('establishment_id', caller.establishmentId).order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse(data ?? []);
    }

    if (action === 'report-loyalty') {
      const { data } = await supabase.from('loyalty').select('*').eq('establishment_id', caller.establishmentId);
      return jsonResponse(data ?? []);
    }

    if (action === 'clear-sales') {
      if (!hasEmployeeAccess(caller, 'adm')) return errorResponse('Acesso restrito a administracao.', 403);
      await supabase.from('orders').delete().eq('establishment_id', caller.establishmentId);
      await supabase.from('transactions').delete().eq('establishment_id', caller.establishmentId);
      await supabase.from('waste_log').delete().eq('establishment_id', caller.establishmentId);
      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------
    // Configurações da loja (leitura já é pública via RLS; escrita exige admin)
    // -----------------------------------------------------------------
    if (action === 'update-settings') {
      if (!hasEmployeeAccess(caller, 'adm')) return errorResponse('Acesso restrito a administracao.', 403);
      const { nomeLoja, whatsappNumero } = body;
      const updates: Record<string, unknown> = {};
      if (nomeLoja != null) updates.nome_loja = nomeLoja;
      if (whatsappNumero != null) updates.whatsapp_numero = whatsappNumero;

      const { data, error } = await supabase.from('settings').update(updates).eq('establishment_id', caller.establishmentId).eq('id', 1).select().maybeSingle();
      if (error) throw error;
      return jsonResponse(data);
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno.', 500);
  }
});
