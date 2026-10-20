// supabase/functions/decidir-solicitacao/index.ts
//
// Usada pelo Painel de Administração (/painel-raiz) para editar, aprovar,
// rejeitar ou bloquear uma solicitação de estabelecimento. Autenticação
// por sessão: o chamador precisa estar logado (Supabase Auth) e constar
// em platform_admins.
//
// Body esperado: { action: 'edit' | 'approve' | 'reject' | 'block', requestId, reason?, fields? }
//
// - edit: atualiza nome/telefone/CPF-CNPJ/endereço da solicitação (fields).
//   Não muda o status nem dispara e-mail.
// - approve: cria o establishment (copiando endereço da solicitação), cria
//   o usuário do dono no Supabase Auth com senha aleatória descartável, e
//   envia link de "definir senha" por e-mail.
// - reject: marca como rejeitado e avisa o solicitante por e-mail. NÃO
//   bloqueia — o mesmo CPF/CNPJ ou e-mail pode solicitar de novo depois.
// - block: marca como rejeitado, avisa o solicitante, E impede que o mesmo
//   CPF/CNPJ ou e-mail solicitem de novo (grava em blocked_identifiers).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { sendEmail } from '../_shared/email.ts';

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 ? isValidCpf(value) : digits.length === 14 ? isValidCnpj(value) : false;
}

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

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!admin) {
    return errorResponse('Acesso negado.', 403);
  }

  try {
    const body = await req.json();
    const { action, requestId, reason, fields } = body;

    if (!requestId || !['edit', 'approve', 'reject', 'block'].includes(action)) {
      return errorResponse('Parâmetros inválidos.', 400);
    }

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

    // === edit ===
    if (action === 'edit') {
      const f = fields ?? {};
      const update: Record<string, unknown> = {};

      if (f.nome !== undefined) {
        if (!String(f.nome).trim()) return errorResponse('Nome não pode ficar vazio.', 400);
        update.owner_nome = String(f.nome).trim();
      }
      if (f.telefone !== undefined) {
        if (!String(f.telefone).trim()) return errorResponse('Telefone não pode ficar vazio.', 400);
        update.owner_telefone = String(f.telefone).trim();
      }
      if (f.cpfCnpj !== undefined) {
        if (!isValidCpfCnpj(String(f.cpfCnpj))) return errorResponse('CPF ou CNPJ inválido.', 400);
        update.owner_cpf_cnpj = String(f.cpfCnpj).replace(/\D/g, '');
      }
      if (f.enderecoCep !== undefined) update.endereco_cep = String(f.enderecoCep).replace(/\D/g, '');
      if (f.enderecoLogradouro !== undefined) update.endereco_logradouro = String(f.enderecoLogradouro).trim();
      if (f.enderecoNumero !== undefined) update.endereco_numero = String(f.enderecoNumero).trim();
      if (f.enderecoComplemento !== undefined) update.endereco_complemento = String(f.enderecoComplemento).trim() || null;
      if (f.enderecoBairro !== undefined) update.endereco_bairro = String(f.enderecoBairro).trim();
      if (f.enderecoCidade !== undefined) update.endereco_cidade = String(f.enderecoCidade).trim();
      if (f.enderecoUf !== undefined) update.endereco_uf = String(f.enderecoUf).trim().toUpperCase();

      if (Object.keys(update).length === 0) {
        return errorResponse('Nenhum campo para atualizar.', 400);
      }

      const { error: updErr } = await supabase
        .from('establishment_requests')
        .update(update)
        .eq('id', requestId);
      if (updErr) throw updErr;

      return jsonResponse({ ok: true, message: 'Solicitação atualizada.' });
    }

    // === reject / block ===
    if (action === 'reject' || action === 'block') {
      await supabase
        .from('establishment_requests')
        .update({
          status: 'rejeitado',
          decided_at: now,
          decided_by: userData.user.id,
          rejection_reason: reason ?? (action === 'block' ? 'Bloqueado pelo administrador.' : null),
        })
        .eq('id', requestId);

      if (action === 'block') {
        await supabase.from('blocked_identifiers').upsert(
          [
            {
              tipo: 'cpf_cnpj',
              valor: reqRow.owner_cpf_cnpj,
              contexto: 'establishment_request',
              motivo: reason ?? null,
              blocked_by: userData.user.id,
            },
            {
              tipo: 'email',
              valor: reqRow.owner_email,
              contexto: 'establishment_request',
              motivo: reason ?? null,
              blocked_by: userData.user.id,
            },
          ],
          { onConflict: 'tipo,valor,contexto', ignoreDuplicates: true },
        );
      }

      await sendEmail({
        to: reqRow.owner_email,
        subject: 'Solicitação de estabelecimento — Nexus',
        html: `<p>Olá, ${reqRow.owner_nome}.</p><p>Sua solicitação de estabelecimento não foi aprovada${reason ? `: ${reason}` : '.'}</p>`,
      }).catch((e) => console.error('Falha ao enviar e-mail de rejeição:', e));

      return jsonResponse({
        ok: true,
        message: action === 'block' ? 'Solicitação rejeitada e identificadores bloqueados.' : 'Solicitação rejeitada.',
      });
    }

    // === approve ===
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
      .update({ status: 'aprovado', decided_at: now, decided_by: userData.user.id, establishment_id: establishmentId })
      .eq('id', requestId);

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
