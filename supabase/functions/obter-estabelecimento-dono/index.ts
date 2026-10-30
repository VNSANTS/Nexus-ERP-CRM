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
      .select('establishment_id, acesso_cozinha, acesso_caixa, acesso_adm, acesso_crm, acesso_relatorios, acesso_estoque, acesso_fornecedores, acesso_produtos, acesso_promocoes, acesso_funcionarios, acesso_configuracoes, acesso_dispositivos')
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

    return jsonResponse({ establishment: {
      id: establishment.id, nomeCompleto: establishment.nome_completo, apelido: establishment.apelido,
      email: establishment.email, cpfCnpj: establishment.cpf_cnpj, onboardingCompleto: establishment.onboarding_completo,
    }, access: {
      acessoCozinha: owner.acesso_cozinha === true, acessoCaixa: owner.acesso_caixa === true, acessoAdm: owner.acesso_adm === true,
      acessoCrm: owner.acesso_crm === true, acessoRelatorios: owner.acesso_relatorios === true, acessoEstoque: owner.acesso_estoque === true,
      acessoFornecedores: owner.acesso_fornecedores === true, acessoProdutos: owner.acesso_produtos === true, acessoPromocoes: owner.acesso_promocoes === true,
      acessoFuncionarios: owner.acesso_funcionarios === true, acessoConfiguracoes: owner.acesso_configuracoes === true, acessoDispositivos: owner.acesso_dispositivos === true,
    } });
  } catch (error) {
    console.error('Falha ao carregar estabelecimento do dono:', error);
    return errorResponse('Não foi possível carregar o estabelecimento.', 500);
  }
});
