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
import { corsHeaders, jsonResponse, errorResponse, uid, shortCode, todayKey, requireEmployee } from '../_shared/helpers.ts';

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
  params: { cartItems: CartItem[]; paymentMethod: string; observacoes?: string; telefone?: string },
) {
  const { cartItems, paymentMethod, observacoes, telefone } = params;
  if (!cartItems?.length) throw { status: 400, message: 'Carrinho vazio.' };

  const [{ data: promos }, { data: allProducts }] = await Promise.all([
    supabase.from('promotions').select('product_ids, tipo, valor').eq('ativo', true),
    supabase.from('products').select('id, name, price'),
  ]);

  const resolvedItems = cartItems
    .map((ci) => {
      const p = (allProducts as Product[] | null)?.find((x) => x.id === ci.productId);
      if (!p) return null;
      return {
        productId: p.id,
        name: p.name,
        price: effectivePrice(p.id, Number(p.price), (promos as Promotion[]) ?? []),
        qty: ci.qty,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (!resolvedItems.length) throw { status: 400, message: 'Nenhum item válido no carrinho.' };

  const total = resolvedItems.reduce((s, i) => s + i.price * i.qty, 0);

  // Contador diário (código de 3 dígitos)
  const today = todayKey();
  const { data: counter } = await supabase.from('daily_counter').select('count').eq('date', today).maybeSingle();
  const newCount = (counter?.count ?? 0) + 1;
  await supabase.from('daily_counter').upsert({ date: today, count: newCount });

  const code = String(newCount).padStart(3, '0');
  const paymentCode = `PAG-${shortCode()}`;
  const id = uid();
  const now = new Date().toISOString();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
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
    resolvedItems.map((i) => ({ order_id: id, product_id: i.productId, name: i.name, price: i.price, qty: i.qty })),
  );
  if (itemsErr) throw { status: 500, message: itemsErr.message };

  // Baixa de estoque (best-effort, item a item — mantém paridade com o Express original)
  for (const item of resolvedItems) {
    const { data: s } = await supabase.from('stock').select('quantidade').eq('product_id', item.productId).maybeSingle();
    if (s) {
      await supabase
        .from('stock')
        .update({ quantidade: Math.max(0, s.quantidade - item.qty), updated_at: now })
        .eq('product_id', item.productId);
    }
  }

  await supabase.from('transactions').insert({
    id: uid(),
    order_id: id,
    order_code: code,
    method: paymentMethod,
    valor: total,
    status: 'confirmado',
    created_at: now,
  });

  const tel = telefone?.trim();
  if (tel) {
    const { data: loy } = await supabase.from('loyalty').select('pedidos').eq('telefone', tel).maybeSingle();
    if (loy) {
      await supabase.from('loyalty').update({ pedidos: loy.pedidos + 1, updated_at: now }).eq('telefone', tel);
    } else {
      await supabase.from('loyalty').insert({ telefone: tel, pedidos: 1, updated_at: now });
    }
  }

  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', id);
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
    if (action === 'checkout' || action === 'manual') {
      const cartItems: CartItem[] =
        action === 'checkout'
          ? body.cartItems
          : (body.items ?? []).filter((i: { qty: number }) => i.qty > 0);
      const result = await createOrder(supabase, {
        cartItems,
        paymentMethod: body.paymentMethod,
        observacoes: body.observacoes,
        telefone: body.telefone,
      });
      return jsonResponse(result, 201);
    }

    if (action === 'confirm-pickup') {
      const code = String(body.code ?? '').trim().padStart(3, '0');
      if (!code) return errorResponse('Código é obrigatório.', 400);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('code', code)
        .gte('created_at', todayStart.toISOString())
        .maybeSingle();

      if (!order) return jsonResponse({ ok: false, message: 'Pedido não encontrado para hoje.' });
      if (order.status === 'cancelado') return jsonResponse({ ok: false, message: 'Este pedido foi cancelado.' });
      if (order.status === 'retirado') return jsonResponse({ ok: false, message: 'Este pedido já foi retirado.' });

      await supabase.from('orders').update({ status: 'retirado', updated_at: new Date().toISOString() }).eq('id', order.id);
      return jsonResponse({ ok: true, message: `Pedido ${order.code} retirado com sucesso!` });
    }

    // -----------------------------------------------------------------
    // Ações do painel da cozinha (requerem JWT de funcionário)
    // -----------------------------------------------------------------
    const caller = await requireEmployee(req);
    if (!caller) return errorResponse('Não autenticado.', 401);

    if (action === 'set-status') {
      const { id, status } = body;
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from('orders')
        .update({ status, updated_at: now })
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!updated) return errorResponse('Pedido não encontrado.', 404);

      if (status === 'cancelado') {
        await supabase.from('transactions').update({ status: 'estornado' }).eq('order_id', id);
      }
      return jsonResponse(updated);
    }

    if (action === 'advance') {
      const flow = ['recebido', 'preparo', 'pronto', 'retirado'];
      const { data: order } = await supabase.from('orders').select('*').eq('id', body.id).maybeSingle();
      if (!order) return errorResponse('Pedido não encontrado.', 404);

      const idx = flow.indexOf(order.status);
      if (idx === -1 || idx === flow.length - 1) return jsonResponse(order);

      const { data: updated, error } = await supabase
        .from('orders')
        .update({ status: flow[idx + 1], updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .select()
        .single();
      if (error) throw error;
      return jsonResponse(updated);
    }

    if (action === 'observacoes') {
      const { id, observacoes } = body;
      const { data: updated, error } = await supabase
        .from('orders')
        .update({ observacoes, updated_at: new Date().toISOString() })
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
