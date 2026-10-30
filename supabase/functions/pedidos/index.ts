// supabase/functions/pedidos/index.ts
//
// Substitui: POST /orders/checkout, /orders/manual, PATCH /orders/:id/status,
// POST /orders/:id/advance, POST /orders/confirm-pickup (Express)
//
// Body esperado: { action: 'checkout' | 'manual' | 'advance' | 'set-status' |
//                          'confirm-pickup' | 'observacoes', ... }
//
// 'checkout' e 'manual' são públicos (o totem não tem login).
// As demais ações exigem JWT de funcionário (painel da cozinha).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse, uid, shortCode, todayKey, requireEmployee, hasEmployeeAccess } from '../_shared/helpers.ts';
import { getClientIp, checkRateLimit } from '../_shared/security.ts';

type CartItem = { productId: string; qty: number };
type Product = { id: string; name: string; price: string | number };
type Promotion = { product_ids: string[]; tipo: 'percentual' | 'fixo'; valor: string | number };

function effectivePrice(productId: string, basePrice: number, promos: Promotion[]): number {
  const promo = promos.find((p) => p.product_ids.includes(productId));
  if (!promo) return basePrice;
  return promo.tipo === 'percentual'
    ? Math.max(0, basePrice * (1 - Number(promo.valor) / 100))
    : Math.max(0, basePrice - Number(promo.valor));
}

async function createOrder(
  supabase: ReturnType<typeof createClient>,
  params: { establishmentId: string; cartItems: CartItem[]; paymentMethod: string; observacoes?: string; telefone?: string; transactionStatus?: 'pendente' | 'confirmado' },
) {
  const { establishmentId, cartItems, paymentMethod, observacoes, telefone, transactionStatus = 'pendente' } = params;
  if (!cartItems?.length) throw { status: 400, message: 'Carrinho vazio.' };
  if (
    cartItems.length > 50 ||
    cartItems.some((item) => !item.productId || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 100) ||
    new Set(cartItems.map((item) => item.productId)).size !== cartItems.length
  ) {
    throw { status: 400, message: 'Itens ou quantidades invalidas.' };
  }
  if (!['pix', 'credito', 'debito', 'dinheiro'].includes(paymentMethod)) {
    throw { status: 400, message: 'Forma de pagamento invalida.' };
  }
  if ((observacoes?.length ?? 0) > 500 || (telefone?.length ?? 0) > 30) {
    throw { status: 400, message: 'Observacoes ou telefone excedem o limite.' };
  }

  const [{ data: promos }, { data: allProducts }] = await Promise.all([
    supabase.from('promotions').select('product_ids, tipo, valor').eq('establishment_id', establishmentId).eq('ativo', true),
    supabase.from('products').select('id, name, price').eq('establishment_id', establishmentId).eq('disponivel', true),
  ]);

  const resolvedItems = cartItems
    .map((ci) => {
      const p = (allProducts as Product[] | null)?.find((x) => x.id === ci.productId);
      if (!p) return null;
      const basePrice = Number(p.price);
      if (!Number.isFinite(basePrice) || basePrice < 0) return null;
      return {
        productId: p.id,
        name: p.name,
        price: effectivePrice(p.id, basePrice, (promos as Promotion[]) ?? []),
        qty: ci.qty,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (!resolvedItems.length) throw { status: 400, message: 'Nenhum item válido no carrinho.' };

  if (resolvedItems.length !== cartItems.length) throw { status: 400, message: 'Um ou mais itens estao indisponiveis.' };

  const productIds = resolvedItems.map((item) => item.productId);
  const { data: stockRows, error: stockError } = await supabase
    .from('stock').select('product_id, quantidade')
    .eq('establishment_id', establishmentId).in('product_id', productIds);
  if (stockError) throw stockError;
  const stockByProduct = new Map((stockRows ?? []).map((row) => [row.product_id, row.quantidade]));
  for (const item of resolvedItems) {
    if ((stockByProduct.get(item.productId) ?? 0) < item.qty) {
      throw { status: 409, message: `Estoque insuficiente para ${item.name}.` };
    }
  }

  const total = resolvedItems.reduce((s, i) => s + i.price * i.qty, 0);

  // Contador diário (código de 3 dígitos)
  const today = todayKey();
  const { data: counter, error: counterError } = await supabase.from('daily_counter').select('count').eq('establishment_id', establishmentId).eq('date', today).maybeSingle();
  if (counterError) throw counterError;
  const newCount = (counter?.count ?? 0) + 1;
  const { error: counterUpsertError } = await supabase.from('daily_counter').upsert({ establishment_id: establishmentId, date: today, count: newCount }, { onConflict: 'establishment_id,date' });
  if (counterUpsertError) throw counterUpsertError;

  const code = String(newCount).padStart(3, '0');
  const paymentCode = `PAG-${shortCode()}`;
  const id = uid();
  const now = new Date().toISOString();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      establishment_id: establishmentId,
      id,
      code,
      payment_code: paymentCode,
      total,
      payment_method: paymentMethod,
      status: 'recebido',
      observacoes: observacoes?.trim() ?? '',
      telefone: telefone?.trim() ?? '',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (orderErr) throw { status: 500, message: orderErr.message };

  const { error: itemsErr } = await supabase.from('order_items').insert(
    resolvedItems.map((i) => ({ establishment_id: establishmentId, order_id: id, product_id: i.productId, name: i.name, price: i.price, qty: i.qty })),
  );
  if (itemsErr) throw { status: 500, message: itemsErr.message };

  // Baixa de estoque (best-effort, item a item — mantém paridade com o Express original)
  for (const item of resolvedItems) {
    const { data: s, error: stockReadError } = await supabase.from('stock').select('quantidade').eq('establishment_id', establishmentId).eq('product_id', item.productId).maybeSingle();
    if (stockReadError) throw stockReadError;
    if (s) {
      const { error: stockUpdateError } = await supabase
        .from('stock')
        .update({ quantidade: Math.max(0, s.quantidade - item.qty), updated_at: now })
        .eq('establishment_id', establishmentId)
        .eq('product_id', item.productId);
      if (stockUpdateError) throw stockUpdateError;
    }
  }

  const { error: transactionError } = await supabase.from('transactions').insert({
    establishment_id: establishmentId,
    id: uid(),
    order_id: id,
    order_code: code,
    method: paymentMethod,
    valor: total,
    status: transactionStatus,
    created_at: now,
  });
  if (transactionError) throw transactionError;

  const tel = telefone?.trim();
  if (tel) {
    const { data: loy } = await supabase.from('loyalty').select('pedidos').eq('establishment_id', establishmentId).eq('telefone', tel).maybeSingle();
    if (loy) {
      await supabase.from('loyalty').update({ pedidos: loy.pedidos + 1, updated_at: now }).eq('establishment_id', establishmentId).eq('telefone', tel);
    } else {
      await supabase.from('loyalty').insert({ establishment_id: establishmentId, telefone: tel, pedidos: 1, updated_at: now });
    }
  }

  const { data: items } = await supabase.from('order_items').select('*').eq('establishment_id', establishmentId).eq('order_id', id);
  return { ...order, items: items ?? [] };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const { action } = body;

    // -----------------------------------------------------------------
    // Ações públicas (totem — sem login)
    // -----------------------------------------------------------------
    if (action === 'checkout') {
      const requestedEstablishmentId = typeof body.establishmentId === 'string' ? body.establishmentId : '';
      let establishmentQuery = supabase.from('establishments').select('id, status');
      if (requestedEstablishmentId) establishmentQuery = establishmentQuery.eq('id', requestedEstablishmentId);
      else establishmentQuery = establishmentQuery.limit(2);
      const { data: establishment, error: establishmentError } = await establishmentQuery.maybeSingle();
      if (establishmentError || !establishment || establishment.status !== 'ativo') return errorResponse('Estabelecimento indisponivel.', 404);
      const ip = getClientIp(req);
      const [ipRate, establishmentRate] = await Promise.all([
        checkRateLimit(supabase, 'checkout_ip', ip, 30, 15),
        checkRateLimit(supabase, 'checkout_establishment', establishment.id, 300, 15),
      ]);
      if (!ipRate.allowed || !establishmentRate.allowed) return errorResponse('Muitas tentativas. Tente novamente mais tarde.', 429);

      const cartItems: CartItem[] = body.cartItems;
      const result = await createOrder(supabase, {
        establishmentId: establishment.id,
        cartItems,
        paymentMethod: body.paymentMethod,
        observacoes: body.observacoes,
        telefone: body.telefone,
        transactionStatus: 'pendente',
      });
      return jsonResponse(result, 201);
    }

    if (action === 'track') {
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
        return errorResponse('Token de acompanhamento inválido.', 400);
      }

      const ip = getClientIp(req);
      const rate = await checkRateLimit(supabase, 'track_ip', ip, 120, 15);
      if (!rate.allowed) return errorResponse('Muitas consultas. Tente novamente mais tarde.', 429);

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, establishment_id, code, payment_code, total, payment_method, status, observacoes, created_at, updated_at, tracking_token')
        .eq('tracking_token', token)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order) return errorResponse('Pedido não encontrado.', 404);

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('id, order_id, product_id, name, price, qty')
        .eq('establishment_id', order.establishment_id)
        .eq('order_id', order.id);
      if (itemsError) throw itemsError;
      const { establishment_id: _establishmentId, ...publicOrder } = order;
      return jsonResponse({ ...publicOrder, items: items ?? [] });
    }

    if (action === 'confirm-pickup') {
      const pickupCaller = await requireEmployee(req);
      if (!pickupCaller) return errorResponse('Nao autenticado.', 401);
      if (!hasEmployeeAccess(pickupCaller, 'caixa') && !hasEmployeeAccess(pickupCaller, 'adm')) return errorResponse('Acesso restrito ao caixa.', 403);
      const code = String(body.code ?? '').trim().padStart(3, '0');
      if (!code) return errorResponse('Código é obrigatório.', 400);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('establishment_id', pickupCaller.establishmentId)
        .eq('code', code)
        .gte('created_at', todayStart.toISOString())
        .maybeSingle();

      if (!order) return jsonResponse({ ok: false, message: 'Pedido não encontrado para hoje.' });
      if (order.status === 'cancelado') return jsonResponse({ ok: false, message: 'Este pedido foi cancelado.' });
      if (order.status === 'retirado') return jsonResponse({ ok: false, message: 'Este pedido já foi retirado.' });

      await supabase.from('orders').update({ status: 'retirado', updated_at: new Date().toISOString() }).eq('establishment_id', pickupCaller.establishmentId).eq('id', order.id);
      return jsonResponse({ ok: true, message: `Pedido ${order.code} retirado com sucesso!` });
    }

    // -----------------------------------------------------------------
    // Ações do painel da cozinha (requerem JWT de funcionário)
    // -----------------------------------------------------------------
    const caller = await requireEmployee(req);
    if (!caller) return errorResponse('Não autenticado.', 401);

    if (action === 'list') {
      if (!hasEmployeeAccess(caller, 'cozinha') && !hasEmployeeAccess(caller, 'caixa') && !hasEmployeeAccess(caller, 'adm')) {
        return errorResponse('Acesso restrito a cozinha ou caixa.', 403);
      }

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('establishment_id', caller.establishmentId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (ordersError) throw ordersError;

      const orderIds = (orders ?? []).map((order) => order.id);
      if (orderIds.length === 0) return jsonResponse([]);

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('establishment_id', caller.establishmentId)
        .in('order_id', orderIds);
      if (itemsError) throw itemsError;

      const itemsByOrder = new Map<string, typeof items>();
      for (const item of items ?? []) {
        const orderItems = itemsByOrder.get(item.order_id) ?? [];
        orderItems.push(item);
        itemsByOrder.set(item.order_id, orderItems);
      }

      return jsonResponse(orders?.map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
      })) ?? []);
    }

    if (action === 'manual') {
      if (!hasEmployeeAccess(caller, 'caixa') && !hasEmployeeAccess(caller, 'adm')) return errorResponse('Acesso restrito ao caixa.', 403);
      const items = Array.isArray(body.items) ? body.items.filter((item: CartItem) => item?.qty > 0) : [];
      const result = await createOrder(supabase, {
        establishmentId: caller.establishmentId,
        cartItems: items,
        paymentMethod: body.paymentMethod,
        observacoes: body.observacoes,
        telefone: body.telefone,
        transactionStatus: 'confirmado',
      });
      return jsonResponse(result, 201);
    }

    if (action === 'set-status') {
      if (!hasEmployeeAccess(caller, 'cozinha') && !hasEmployeeAccess(caller, 'adm')) return errorResponse('Acesso restrito a cozinha.', 403);
      const { id, status } = body;
      if (!id || !['recebido', 'preparo', 'pronto', 'retirado', 'cancelado'].includes(status)) return errorResponse('Status do pedido invalido.', 400);
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from('orders')
        .update({ status, updated_at: now })
        .eq('establishment_id', caller.establishmentId)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!updated) return errorResponse('Pedido não encontrado.', 404);

      if (status === 'cancelado') {
        await supabase.from('transactions').update({ status: 'estornado' }).eq('establishment_id', caller.establishmentId).eq('order_id', id).eq('status', 'confirmado');
        await supabase.from('transactions').update({ status: 'cancelado' }).eq('establishment_id', caller.establishmentId).eq('order_id', id).eq('status', 'pendente');
      }
      return jsonResponse(updated);
    }

    if (action === 'advance') {
      if (!hasEmployeeAccess(caller, 'cozinha') && !hasEmployeeAccess(caller, 'adm')) return errorResponse('Acesso restrito a cozinha.', 403);
      const flow = ['recebido', 'preparo', 'pronto', 'retirado'];
      const { data: order } = await supabase.from('orders').select('*').eq('establishment_id', caller.establishmentId).eq('id', body.id).maybeSingle();
      if (!order) return errorResponse('Pedido não encontrado.', 404);

      const idx = flow.indexOf(order.status);
      if (idx === -1 || idx === flow.length - 1) return jsonResponse(order);

      const { data: updated, error } = await supabase
        .from('orders')
        .update({ status: flow[idx + 1], updated_at: new Date().toISOString() })
        .eq('establishment_id', caller.establishmentId)
        .eq('id', order.id)
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(updated);
    }

    if (action === 'observacoes') {
      if (!hasEmployeeAccess(caller, 'cozinha') && !hasEmployeeAccess(caller, 'adm')) return errorResponse('Acesso restrito a cozinha.', 403);
      const { id, observacoes } = body;
      const { data: updated, error } = await supabase
        .from('orders')
        .update({ observacoes, updated_at: new Date().toISOString() })
        .eq('establishment_id', caller.establishmentId)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!updated) return errorResponse('Pedido não encontrado.', 404);
      return jsonResponse(updated);
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400);
  } catch (err: unknown) {
    console.error(err);
    const e = err as { status?: number; message?: string };
    return errorResponse(e.message ?? 'Erro interno ao processar pedido.', e.status ?? 500);
  }
});
