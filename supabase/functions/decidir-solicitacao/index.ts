// supabase/functions/decidir-solicitacao/index.ts
//
// Usada por VOCÊ (dono da Nexus) para aprovar ou rejeitar uma solicitação
// de estabelecimento. Protegida por um segredo próprio (NEXUS_ADMIN_SECRET),
// não pelo sistema de login dos estabelecimentos — você não é um
// funcionário de nenhum estabelecimento, é o dono da plataforma.
//
// Body esperado: { action: 'approve' | 'reject', requestId, adminSecret, reason? }
//
// Na aprovação: cria o registro em `establishments` (copiando também o
// endereço da solicitação), cria o usuário do dono no Supabase Auth com
// senha aleatória descartável, e envia um link de "definir senha" por
// e-mail — o dono nunca soube dessa senha temporária.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { sendEmail } from '../_shared/email.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, requestId, adminSecret, reason } = body;

    const expectedSecret = Deno.env.get('NEXUS_ADMIN_SECRET');
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return errorResponse('Não autorizado.', 401);
    }
    if (!requestId || (action !== 'approve' && action !== 'reject')) {
      return errorResponse('Parâmetros inválidos.', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: reqRow, error: findErr } = await supabase
      .from('establishment_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!reqRow) return errorResponse('Solicitação não encontrada.', 404);
    if (reqRow.status !== 'pendente') {
      return jsonResponse({ ok: false, message: `Esta solicitação já foi ${reqRow.status}.` });
    }

    const now = new Date().toISOString();

    if (action === 'reject') {
      await supabase
        .from('establishment_requests')
        .update({ status: 'rejeitado', decided_at: now, decided_by: 'nexus-admin', rejection_reason: reason ?? null })
        .eq('id', requestId);

      await sendEmail({
        to: reqRow.owner_email,
        subject: 'Solicitação de estabelecimento — Nexus',
        html: `<p>Olá, ${reqRow.owner_nome}.</p><p>Sua solicitação de estabelecimento não foi aprovada${reason ? `: ${reason}` : '.'}</p>`,
      }).catch((e) => console.error('Falha ao enviar e-mail de rejeição:', e));

      return jsonResponse({ ok: true, message: 'Solicitação rejeitada.' });
    }

    // action === 'approve'
    const establishmentId = crypto.randomUUID();
    const { error: estErr } = await supabase.from('establishments').insert({
      id: establishmentId,
      nome_completo: reqRow.owner_nome, // placeholder — o dono preenche o nome real do estabelecimento no onboarding
      apelido: reqRow.owner_nome,
      email: reqRow.owner_email,
      cpf_cnpj: reqRow.owner_cpf_cnpj,
      status: 'ativo',
      onboarding_completo: false,
      endereco_cep: reqRow.endereco_cep ?? null,
      endereco_logradouro: reqRow.endereco_logradouro ?? null,
      endereco_numero: reqRow.endereco_numero ?? null,
      endereco_complemento: reqRow.endereco_complemento ?? null,
      endereco_bairro: reqRow.endereco_bairro ?? null,
      endereco_cidade: reqRow.endereco_cidade ?? null,
      endereco_uf: reqRow.endereco_uf ?? null,
    });
    if (estErr) throw estErr;

    // Cria o usuário do dono no Supabase Auth com senha aleatória
    // descartável — o dono nunca vê essa senha, define a própria via link.
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: reqRow.owner_email,
      email_confirm: true,
      user_metadata: { role: 'owner', establishmentId, nome: reqRow.owner_nome },
      password: crypto.randomUUID(),
    });
    if (authErr) throw authErr;

    await supabase.from('establishment_owners').insert({
      id: authUser.user.id,
      establishment_id: establishmentId,
      nome_completo: reqRow.owner_nome,
      email: reqRow.owner_email,
      telefone: reqRow.owner_telefone,
      cpf_cnpj: reqRow.owner_cpf_cnpj,
    });

    await supabase
      .from('establishment_requests')
      .update({ status: 'aprovado', decided_at: now, decided_by: 'nexus-admin', establishment_id: establishmentId })
      .eq('id', requestId);

    // Gera link de definição de senha
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: reqRow.owner_email,
    });
    if (linkErr) console.error('Falha ao gerar link de senha:', linkErr);

    await sendEmail({
      to: reqRow.owner_email,
      subject: 'Sua conta Nexus foi aprovada!',
      html: `
        <p>Olá, ${reqRow.owner_nome}.</p>
        <p>Sua solicitação de estabelecimento foi aprovada.</p>
        ${linkData?.properties?.action_link
          ? `<p>Defina sua senha e acesse o painel: <a href="${linkData.properties.action_link}">clique aqui</a></p>`
          : '<p>Entre em contato com o suporte para definir sua senha de acesso.</p>'}
      `,
    }).catch((e) => console.error('Falha ao enviar e-mail de aprovação:', e));

    return jsonResponse({ ok: true, message: 'Estabelecimento aprovado e criado.', establishmentId });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao decidir solicitação.', 500);
  }
});
