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

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse, requireEmployee, hasEmployeeAccess } from '../_shared/helpers.ts';
import { getClientIp, checkRateLimit } from '../_shared/security.ts';

type CartItem = { productId: string; qty: number };

async function createOrder(
  supabase: SupabaseClient<any>,
  params: { establishmentId: string; cartItems: CartItem[]; paymentMethod: string; observacoes?: string; telefone?: string; transactionStatus?: 'pendente' | 'confirmado'; idempotencyKey?: string },
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

  const { data, error } = await supabase.rpc('checkout_order_atomic', {
    p_establishment_id: establishmentId,
    p_cart_items: cartItems,
    p_payment_method: paymentMethod,
    p_observacoes: observacoes?.trim() ?? '',
    p_telefone: telefone?.trim() ?? '',
    p_transaction_status: transactionStatus,
    p_idempotency_key: params.idempotencyKey ?? crypto.randomUUID(),
  });
  if (error) {
    if (error.message === 'STOCK_INSUFFICIENT') throw { status: 409, message: 'Estoque insuficiente para um ou mais itens.' };
    if (error.message === 'PRODUCT_UNAVAILABLE') throw { status: 409, message: 'Um ou mais produtos não estão disponíveis.' };
    if (error.message === 'ESTABLISHMENT_UNAVAILABLE') throw { status: 404, message: 'Estabelecimento indisponível.' };
    if (error.code === '22023') throw { status: 400, message: 'Dados do pedido inválidos.' };
    throw error;
  }
  return data;
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
    if (action === 'menu') {
      const requestedEstablishmentId = typeof body.establishmentId === 'string' ? body.establishmentId : '';
      let establishmentQuery = supabase.from('establishments').select('id, status');
      if (requestedEstablishmentId) establishmentQuery = establishmentQuery.eq('id', requestedEstablishmentId);
      else establishmentQuery = establishmentQuery.limit(2);
      const { data: establishment, error: establishmentError } = await establishmentQuery.maybeSingle();
      if (establishmentError || !establishment || establishment.status !== 'ativo') {
        return errorResponse('Estabelecimento indisponível.', 404);
      }

      const rate = await checkRateLimit(supabase, 'menu_ip', getClientIp(req), 300, 15);
      if (!rate.allowed) return errorResponse('Muitas consultas. Tente novamente mais tarde.', 429);

      const [productsResult, stockResult, promotionsResult, settingsResult] = await Promise.all([
        supabase.from('products')
          .select('id, name, price, emoji, categoria, sazonal, disponivel, image_url, created_at, updated_at')
          .eq('establishment_id', establishment.id)
          .eq('disponivel', true),
        supabase.from('stock')
          .select('product_id, quantidade')
          .eq('establishment_id', establishment.id),
        supabase.from('promotions')
          .select('id, nome, tipo, valor, product_ids, ativo, created_at')
          .eq('establishment_id', establishment.id)
          .eq('ativo', true),
        supabase.from('settings')
          .select('id, nome_loja, whatsapp_numero')
          .eq('establishment_id', establishment.id)
          .eq('id', 1)
          .maybeSingle(),
      ]);
      const menuError = productsResult.error ?? stockResult.error ?? promotionsResult.error ?? settingsResult.error;
      if (menuError) throw menuError;
      const visibleProductIds = new Set((productsResult.data ?? []).map((product) => product.id));

      return jsonResponse({
        establishmentId: establishment.id,
        products: productsResult.data ?? [],
        stock: (stockResult.data ?? []).filter((row) => visibleProductIds.has(row.product_id)),
        promotions: promotionsResult.data ?? [],
        settings: settingsResult.data ?? { id: 1, nome_loja: '', whatsapp_numero: '' },
      });
    }

    if (action === 'my-loyalty') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return errorResponse('Não autenticado.', 401);
      const { data: authData, error: authError } = await supabase.auth.getUser(authHeader.slice('Bearer '.length));
      if (authError || !authData.user) return errorResponse('Sessão inválida ou expirada.', 401);

      const rate = await checkRateLimit(supabase, 'my_loyalty_user', authData.user.id, 60, 60);
      if (!rate.allowed) return errorResponse('Muitas consultas. Tente novamente mais tarde.', 429);

      const { data: customer } = await supabase.from('customer_accounts')
        .select('telefone, cadastro_completo')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (!customer?.cadastro_completo || !customer.telefone) {
        return errorResponse('Complete seu cadastro para consultar a fidelidade.', 403);
      }

      const requestedEstablishmentId = typeof body.establishmentId === 'string' ? body.establishmentId : '';
      let establishmentQuery = supabase.from('establishments').select('id, status');
      if (requestedEstablishmentId) establishmentQuery = establishmentQuery.eq('id', requestedEstablishmentId);
      else establishmentQuery = establishmentQuery.limit(2);
      const { data: establishment, error: establishmentError } = await establishmentQuery.maybeSingle();
      if (establishmentError || !establishment || establishment.status !== 'ativo') {
        return errorResponse('Estabelecimento indisponível.', 404);
      }

      const { data: loyalty, error: loyaltyError } = await supabase.from('loyalty')
        .select('telefone, pedidos, updated_at')
        .eq('establishment_id', establishment.id)
        .eq('telefone', customer.telefone)
        .maybeSingle();
      if (loyaltyError) throw loyaltyError;
      return jsonResponse(loyalty ?? { telefone: customer.telefone, pedidos: 0, updated_at: null });
    }

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
        idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
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
    const e = err as { status?: number; message?: string };
    const status = Number.isInteger(e?.status) && (e.status as number) >= 400 && (e.status as number) < 500
      ? e.status as number
      : 500;
    if (status === 500) console.error('Falha interna ao processar pedido.');
    return errorResponse(status === 500 ? 'Erro interno ao processar pedido.' : e.message ?? 'Não foi possível processar pedido.', status);
  }
});
