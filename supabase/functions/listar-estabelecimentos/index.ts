// supabase/functions/listar-estabelecimentos/index.ts
//
// Lista estabelecimentos ativos para a tela de seleção do cliente, com
// busca opcional por nome. Pública (não requer autenticação) — só expõe
// dados não sensíveis (nome, cidade/UF), nunca e-mail/CPF do dono.
//
// Query params: ?busca=texto (opcional)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const url = new URL(req.url);
    const busca = url.searchParams.get('busca')?.trim();

    let query = supabase
      .from('establishments')
      .select('id, apelido, nome_completo, endereco_cidade, endereco_uf')
      .eq('status', 'ativo')
      .order('apelido', { ascending: true })
      .limit(50);

    if (busca) {
      query = query.or(`apelido.ilike.%${busca}%,nome_completo.ilike.%${busca}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao listar estabelecimentos:', error);
      return errorResponse('Não foi possível carregar os estabelecimentos.', 500);
    }

    return jsonResponse({ ok: true, estabelecimentos: data ?? [] });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao listar estabelecimentos.', 500);
  }
});
