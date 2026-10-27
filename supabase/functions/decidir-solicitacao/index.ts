// supabase/functions/decidir-solicitacao/index.ts
//
// Usada pelo Painel de Administração (/painel-raiz) para editar, aprovar,
// rejeitar ou bloquear uma solicitação de estabelecimento. Autenticação
// por sessão: o chamador precisa estar logado (Supabase Auth) e constar
// em platform_admins.
//
// Body esperado: { action: 'edit' | 'approve' | 'reject' | 'block' | 'unblock' | 'delete-establishment', requestId, reason?, fields? }
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

    if (!requestId || !['edit', 'approve', 'reject', 'block', 'unblock', 'delete', 'delete-establishment'].includes(action)) {
      return errorResponse('Parâmetros inválidos.', 400);
    }

    const { data: reqRow, error: findErr } = await supabase
      .from('establishment_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!reqRow) return errorResponse('Solicitação não encontrada.', 404);

    // Exclusão manual: somente solicitações pendentes ou rejeitadas podem ser removidas.
    // A exclusão não apaga estabelecimento, usuário Auth nem identificadores bloqueados.
    if (action === 'delete') {
      if (reqRow.status !== 'pendente' && reqRow.status !== 'rejeitado') {
        return jsonResponse({ ok: false, message: 'Só é possível excluir solicitações pendentes ou rejeitadas.' });
      }
      const { data: deleted, error: deleteErr } = await supabase
        .from('establishment_requests')
        .delete()
        .eq('id', requestId)
        .eq('status', reqRow.status)
        .select('id')
        .maybeSingle();
      if (deleteErr) throw deleteErr;
      if (!deleted) {
        return jsonResponse({ ok: false, message: 'A solicitação mudou de status. Atualize a lista e tente novamente.' });
      }
      return jsonResponse({ ok: true, message: 'Solicitação excluída do histórico.' });
    }

    if (action === 'delete-establishment') {
      if (reqRow.status !== 'aprovado' || !reqRow.establishment_id) {
        return jsonResponse({ ok: false, message: 'Só é possível excluir estabelecimentos aprovados.' });
      }

      const establishmentId = reqRow.establishment_id as string;
      const { data: establishment, error: establishmentErr } = await supabase
        .from('establishments')
        .select('id, status')
        .eq('id', establishmentId)
        .maybeSingle();
      if (establishmentErr) throw establishmentErr;
      if (!establishment || !['ativo', 'bloqueado'].includes(establishment.status)) {
        return jsonResponse({ ok: false, message: 'Estabelecimento não encontrado ou com status incompatível.' });
      }

      const { data: owners, error: ownersErr } = await supabase
        .from('establishment_owners')
        .select('id')
        .eq('establishment_id', establishmentId);
      if (ownersErr) throw ownersErr;

      const { data: employees, error: employeesErr } = await supabase
        .from('employees')
        .select('id, auth_user_id')
        .eq('establishment_id', establishmentId);
      if (employeesErr) throw employeesErr;

      const linkedUserIds = [...new Set([
        ...(owners ?? []).map((owner) => owner.id),
        ...(employees ?? []).flatMap((employee) => [employee.id, employee.auth_user_id].filter(Boolean)),
      ])];

      // Preserve any platform-admin account that also owns this establishment.
      const { data: platformAdmins, error: adminsErr } = linkedUserIds.length
        ? await supabase.from('platform_admins').select('id').in('id', linkedUserIds)
        : { data: [], error: null };
      if (adminsErr) throw adminsErr;
      const protectedAdminIds = new Set((platformAdmins ?? []).map((admin) => admin.id));

      for (const userId of linkedUserIds) {
        if (protectedAdminIds.has(userId)) continue;
        const { data: authUser, error: lookupErr } = await supabase.auth.admin.getUserById(userId);
        if (lookupErr && lookupErr.status !== 404) throw lookupErr;
        if (!authUser?.user) continue;

        const { error: deleteUserErr } = await supabase.auth.admin.deleteUser(userId);
        if (deleteUserErr) throw deleteUserErr;
      }

      // Keep the database's foreign-key relationship valid by removing the
      // approval record before deleting its establishment. The dependent
      // owners, employees and devices are removed by their cascade rules.
      const { error: requestDeleteErr } = await supabase
        .from('establishment_requests')
        .delete()
        .eq('establishment_id', establishmentId);
      if (requestDeleteErr) throw requestDeleteErr;

      const { data: deletedEstablishment, error: deleteEstablishmentErr } = await supabase
        .from('establishments')
        .delete()
        .eq('id', establishmentId)
        .in('status', ['ativo', 'bloqueado'])
        .select('id')
        .maybeSingle();
      if (deleteEstablishmentErr) throw deleteEstablishmentErr;
      if (!deletedEstablishment) {
        return jsonResponse({ ok: false, message: 'O estabelecimento mudou de status. Atualize a lista e tente novamente.' });
      }

      return jsonResponse({ ok: true, message: 'Estabelecimento e acessos vinculados excluídos. Identificadores bloqueados foram preservados.' });
    }

    // 'block' é a única ação permitida fora do status 'pendente' — serve
    // para bloquear um estabelecimento JÁ APROVADO (ex: fraude descoberta
    // depois da aprovação). As demais ações (edit/approve/reject) só
    // fazem sentido enquanto a solicitação ainda está pendente.
    if (action === 'unblock') {
      if (reqRow.status !== 'aprovado' || !reqRow.establishment_id) {
        return jsonResponse({ ok: false, message: 'Só é possível desbloquear estabelecimentos aprovados.' });
      }

      const { data: establishment, error: establishmentErr } = await supabase
        .from('establishments')
        .select('id, status')
        .eq('id', reqRow.establishment_id)
        .maybeSingle();
      if (establishmentErr) throw establishmentErr;
      if (!establishment) {
        return jsonResponse({ ok: false, message: 'Estabelecimento vinculado não encontrado.' });
      }
      if (establishment.status !== 'bloqueado') {
        return jsonResponse({ ok: false, message: 'Este estabelecimento já está desbloqueado.' });
      }

      const { error: cpfBlockErr } = await supabase
        .from('blocked_identifiers')
        .delete()
        .eq('tipo', 'cpf_cnpj')
        .eq('valor', reqRow.owner_cpf_cnpj)
        .eq('contexto', 'establishment_request');
      if (cpfBlockErr) throw cpfBlockErr;

      const { error: emailBlockErr } = await supabase
        .from('blocked_identifiers')
        .delete()
        .eq('tipo', 'email')
        .eq('valor', reqRow.owner_email)
        .eq('contexto', 'establishment_request');
      if (emailBlockErr) throw emailBlockErr;

      const { data: reactivated, error: reactivateErr } = await supabase
        .from('establishments')
        .update({ status: 'ativo', updated_at: new Date().toISOString() })
        .eq('id', reqRow.establishment_id)
        .eq('status', 'bloqueado')
        .select('id')
        .maybeSingle();
      if (reactivateErr) throw reactivateErr;
      if (!reactivated) {
        return jsonResponse({ ok: false, message: 'O status do estabelecimento mudou. Atualize a lista e tente novamente.' });
      }

      await sendEmail({
        to: reqRow.owner_email,
        subject: 'Seu acesso à Nexus foi desbloqueado',
        html: `<p>Olá, ${reqRow.owner_nome}.</p><p>O acesso do seu estabelecimento foi desbloqueado pela administração da Nexus. Você já pode voltar a utilizar a plataforma.</p>`,
      }).catch((e) => console.error('Falha ao enviar e-mail de desbloqueio:', e));

      return jsonResponse({ ok: true, message: 'Estabelecimento desbloqueado e identificadores liberados.' });
    }

    const podeAgirForaDePendente = action === 'block' && reqRow.status === 'aprovado';
    if (reqRow.status !== 'pendente' && !podeAgirForaDePendente) {
      return jsonResponse({ ok: false, message: `Esta solicitação já foi ${reqRow.status}.` });
    }

    const now = new Date().toISOString();

    // === block em solicitação já aprovada: desativa o estabelecimento
    // de verdade, não só a solicitação (senão o bloqueio seria só
    // cosmético e o estabelecimento continuaria ativo e operando) ===
    if (action === 'block' && reqRow.status === 'aprovado' && reqRow.establishment_id) {
      await supabase
        .from('establishments')
        .update({ status: 'bloqueado', updated_at: now })
        .eq('id', reqRow.establishment_id);
    }

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
      // Se a solicitação ainda estava pendente, vira 'rejeitado' (histórico
      // normal). Se já estava 'aprovado' e agora está sendo bloqueada, o
      // registro da solicitação em si continua mostrando 'aprovado' — foi
      // o establishment que mudou de status, não o fato histórico de que
      // a solicitação original tinha sido aprovada.
      if (reqRow.status === 'pendente') {
        await supabase
          .from('establishment_requests')
          .update({
            status: 'rejeitado',
            decided_at: now,
            decided_by: userData.user.id,
            rejection_reason: reason ?? (action === 'block' ? 'Bloqueado pelo administrador.' : null),
          })
          .eq('id', requestId);
      }

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

      const eraAprovado = reqRow.status === 'aprovado';
      await sendEmail({
        to: reqRow.owner_email,
        subject: eraAprovado ? 'Seu acesso à Nexus foi bloqueado' : 'Solicitação de estabelecimento — Nexus',
        html: eraAprovado
          ? `<p>Olá, ${reqRow.owner_nome}.</p><p>Seu estabelecimento foi bloqueado pela administração da Nexus${reason ? `: ${reason}` : '.'}</p>`
          : `<p>Olá, ${reqRow.owner_nome}.</p><p>Sua solicitação de estabelecimento não foi aprovada${reason ? `: ${reason}` : '.'}</p>`,
      }).catch((e) => console.error('Falha ao enviar e-mail de rejeição/bloqueio:', e));

      return jsonResponse({
        ok: true,
        message:
          action === 'block'
            ? eraAprovado
              ? 'Estabelecimento bloqueado e identificadores restritos.'
              : 'Solicitação rejeitada e identificadores bloqueados.'
            : 'Solicitação rejeitada.',
      });
    }

    // === approve ===

    // Checa duplicidade ANTES de tentar criar — sem isso, a tentativa só
    // falha na constraint UNIQUE do banco com um erro genérico (23505),
    // sem dizer ao admin qual é o problema real nem qual dos dois campos
    // colidiu. Isso acontece quando o mesmo e-mail/CPF já tem outra
    // solicitação aprovada antes (ex: testes, ou o solicitante mandou
    // duas solicitações com o mesmo e-mail).
    const { data: existingByEmail } = await supabase
      .from('establishments')
      .select('id')
      .eq('email', reqRow.owner_email)
      .maybeSingle();
    if (existingByEmail) {
      return jsonResponse({
        ok: false,
        message: 'Já existe um estabelecimento aprovado com este e-mail. Rejeite esta solicitação duplicada.',
      });
    }
    const { data: existingByCpfCnpj } = await supabase
      .from('establishments')
      .select('id')
      .eq('cpf_cnpj', reqRow.owner_cpf_cnpj)
      .maybeSingle();
    if (existingByCpfCnpj) {
      return jsonResponse({
        ok: false,
        message: 'Já existe um estabelecimento aprovado com este CPF/CNPJ. Rejeite esta solicitação duplicada.',
      });
    }

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

    // IMPORTANTE: usa resetPasswordForEmail (não generateLink + Resend).
    // generateLink() SÓ gera a URL e nunca envia nada sozinho — alguém
    // precisa mandar o e-mail, e isso dependia do Resend, que recusa
    // (403) qualquer destinatário fora da conta enquanto não houver um
    // domínio verificado. resetPasswordForEmail() já dispara o e-mail
    // pelo sistema nativo do Supabase (sujeito a 2 e-mails/hora no plano
    // grátis, mas sem a trava de domínio), então chega a qualquer
    // destinatário de verdade.
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(reqRow.owner_email, {
      redirectTo: 'https://vnsants.github.io/Nexus-ERP-CRM/estabelecimento/onboarding',
    });
    if (resetErr) {
      console.error('Falha ao enviar e-mail de definição de senha:', resetErr);
    }

    return jsonResponse({ ok: true, message: 'Estabelecimento aprovado e criado.', establishmentId });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao decidir solicitação.', 500);
  }
});
