// supabase/functions/finalizar-onboarding/index.ts
//
// Marca establishments.onboarding_completo = true, liberando a tela final
// (acessar Cardápio / Cozinha / ADM). Chamada depois que o dono já salvou
// o Passo 1 e criou ao menos 1 funcionário no Passo 2.
//
// Autenticação: Bearer token do dono (establishment_owners).

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

  const { data: owner } = await supabase
    .from('establishment_owners')
    .select('establishment_id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!owner) {
    return errorResponse('Acesso negado.', 403);
  }

  try {
    // Confirma que há ao menos 1 funcionário antes de liberar — evita
    // finalizar o onboarding sem ninguém com acesso operacional.
    const { count } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', owner.establishment_id);

    if (!count || count === 0) {
      return errorResponse('Cadastre ao menos um funcionário antes de finalizar.', 400);
    }

    const { error: updErr } = await supabase
      .from('establishments')
      .update({ onboarding_completo: true, updated_at: new Date().toISOString() })
      .eq('id', owner.establishment_id);

    if (updErr) throw updErr;

    return jsonResponse({ ok: true, message: 'Configuração inicial concluída.' });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao finalizar onboarding.', 500);
  }
});
