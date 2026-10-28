import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return errorResponse('Não autenticado.', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: userError } = await supabase.auth.getUser(
    authHeader.slice('Bearer '.length),
  );
  if (userError || !userData.user) return errorResponse('Sessão inválida ou expirada.', 401);

  try {
    const { data: owner, error: ownerError } = await supabase
      .from('establishment_owners')
      .select('establishment_id')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (ownerError) throw ownerError;
    if (!owner) return errorResponse('Nenhum estabelecimento vinculado a esta conta.', 403);

    const { data: establishment, error: establishmentError } = await supabase
      .from('establishments')
      .select('id, nome_completo, apelido, email, cpf_cnpj, onboarding_completo')
      .eq('id', owner.establishment_id)
      .maybeSingle();

    if (establishmentError) throw establishmentError;
    if (!establishment) return errorResponse('Estabelecimento não encontrado.', 404);

    return jsonResponse({ establishment });
  } catch (error) {
    console.error('Falha ao carregar estabelecimento do dono:', error);
    return errorResponse('Não foi possível carregar o estabelecimento.', 500);
  }
});
