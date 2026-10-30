// supabase/functions/revogar-dispositivo-cardapio/index.ts
//
// Revoga (desativa) um dispositivo de cardápio remotamente. Usado quando
// o dono precisa trocar de tablet, resetar uma senha esquecida, ou parar
// um dispositivo perdido/roubado de continuar acessando o cardápio — não
// existe forma de sair do modo kiosk pelo próprio tablet, só por aqui.
//
// Autenticação: Bearer token do dono (establishment_owners) OU de um
// funcionário com acesso_adm=true no mesmo estabelecimento, e o device
// precisa pertencer a esse estabelecimento (nunca aceita deviceId de
// outro estabelecimento, mesmo que adivinhado).
//
// Body esperado: { deviceId, action?: 'revoke' | 'delete' }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Não autenticado.', 401);
  }
  const token = authHeader.slice('Bearer '.length);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return errorResponse('Sessão inválida ou expirada.', 401);
  }

  let establishmentId: string | null = null;

  const { data: owner } = await supabase
    .from('establishment_owners')
    .select('establishment_id, acesso_dispositivos')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (owner?.acesso_dispositivos === true) {
    establishmentId = owner.establishment_id;
  } else {
    const { data: adminEmployee } = await supabase
      .from('employees')
      .select('establishment_id')
      .eq('auth_user_id', userData.user.id)
      .eq('acesso_dispositivos', true)
      .eq('ativo', true)
      .maybeSingle();
    if (adminEmployee) establishmentId = adminEmployee.establishment_id;
  }

  if (!establishmentId) {
    return errorResponse('Acesso negado.', 403);
  }

  try {
    const { deviceId, action = 'revoke' } = await req.json();
    if (!deviceId) {
      return errorResponse('deviceId é obrigatório.', 400);
    }
    if (action !== 'revoke' && action !== 'delete') {
      return errorResponse('Ação inválida.', 400);
    }

    if (action === 'delete') {
      const { data, error } = await supabase
        .from('establishment_devices')
        .delete()
        .eq('id', deviceId)
        .eq('establishment_id', establishmentId)
        .eq('ativo', false)
        .not('revoked_at', 'is', null)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) return errorResponse('Dispositivo revogado não encontrado.', 404);
      return jsonResponse({ ok: true, message: 'Dispositivo excluído.' });
    }

    // IMPORTANTE: o filtro por establishment_id aqui é o que impede um
    // dono/admin de revogar (ou até confirmar a existência de) um
    // dispositivo de OUTRO estabelecimento — sem isso seria um IDOR.
    const { data, error } = await supabase
      .from('establishment_devices')
      .update({ ativo: false, revoked_at: new Date().toISOString() })
      .eq('id', deviceId)
      .eq('establishment_id', establishmentId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return errorResponse('Dispositivo não encontrado.', 404);
    }

    return jsonResponse({ ok: true, message: 'Dispositivo revogado.' });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao revogar dispositivo.', 500);
  }
});
