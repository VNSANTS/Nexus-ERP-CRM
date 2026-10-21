// supabase/functions/expirar-solicitacoes/index.ts
//
// Marca como 'expirado' toda solicitação pendente cujo prazo de 90 dias
// passou. Pensada para rodar automaticamente via pg_cron (ver
// 03_cron_expiracao.sql) — mas também pode ser chamada manualmente.
//
// SEGURANÇA: embora o impacto de uma chamada não autorizada seja baixo
// (só altera status de registros de domínio público da plataforma, não
// vaza nem aceita dados sensíveis), a rota ficava publicamente invocável
// sem nenhum controle — qualquer um na internet podia disparar a
// expiração fora de hora. Agora exige o mesmo CRON_SECRET usado pelo
// agendador (pg_cron ou chamada manual autorizada).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expectedSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return errorResponse('Não autorizado.', 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase
    .from('establishment_requests')
    .update({ status: 'expirado' })
    .eq('status', 'pendente')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse({ ok: true, expiradas: data?.length ?? 0 });
});
