// supabase/functions/expirar-solicitacoes/index.ts
//
// Marca como 'expirado' toda solicitação pendente cujo prazo de 90 dias
// passou. Pensada para rodar automaticamente via pg_cron (ver
// 03_cron_expiracao.sql) — mas também pode ser chamada manualmente.
// Não requer autenticação de usuário porque não expõe nem aceita dados
// sensíveis; protegida apenas por ser invocada internamente pelo cron
// com a service_role key.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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
