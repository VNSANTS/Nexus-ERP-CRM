// supabase/functions/customer-signup-step2/index.ts
//
// Segunda etapa do cadastro de cliente: chamada DEPOIS que o e-mail já foi
// confirmado (o usuário já existe em auth.users e já está autenticado).
// Preenche nome, telefone, CPF e endereço, e marca cadastro_completo = true.
//
// Autenticação: Bearer token do próprio usuário (não é admin/funcionário).
//
// Body esperado: {
//   nome, telefone, telefoneWhatsapp, cpf,
//   enderecoCep, enderecoLogradouro, enderecoNumero, enderecoComplemento,
//   enderecoBairro, enderecoCidade, enderecoUf
// }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';

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

function isValidCep(cep: string): boolean {
  return /^\d{8}$/.test(cep.replace(/\D/g, ''));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Não autenticado.', 401);
  }
  const token = authHeader.slice('Bearer '.length);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return errorResponse('Sessão inválida ou expirada.', 401);
  }
  const user = userData.user;
  if (!user.email_confirmed_at) {
    return errorResponse('Confirme seu e-mail antes de completar o cadastro.', 403);
  }

  try {
    const body = await req.json();
    const {
      nome,
      telefone,
      telefoneWhatsapp,
      cpf,
      enderecoCep,
      enderecoLogradouro,
      enderecoNumero,
      enderecoComplemento,
      enderecoBairro,
      enderecoCidade,
      enderecoUf,
    } = body;

    if (!nome?.trim() || !telefone?.trim() || !cpf?.trim()) {
      return errorResponse('Nome, telefone e CPF são obrigatórios.', 400);
    }
    if (!isValidCpf(cpf)) {
      return errorResponse('CPF inválido.', 400);
    }
    if (
      !enderecoCep?.trim() ||
      !enderecoLogradouro?.trim() ||
      !enderecoNumero?.trim() ||
      !enderecoBairro?.trim() ||
      !enderecoCidade?.trim() ||
      !enderecoUf?.trim()
    ) {
      return errorResponse('Endereço completo é obrigatório.', 400);
    }
    if (!isValidCep(enderecoCep)) {
      return errorResponse('CEP inválido.', 400);
    }
    if (!/^[A-Za-z]{2}$/.test(enderecoUf.trim())) {
      return errorResponse('UF inválida.', 400);
    }

    const cpfDigits = cpf.replace(/\D/g, '');
    const telefoneDigits = telefone.replace(/\D/g, '');

    // Verifica duplicidade de CPF/telefone em outra conta antes de tentar
    // o upsert (mensagem mais clara do que deixar a constraint estourar).
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('id')
      .neq('id', user.id)
      .or(`cpf.eq.${cpfDigits},telefone.eq.${telefoneDigits}`)
      .maybeSingle();

    if (existing) {
      return errorResponse('CPF ou telefone já cadastrado em outra conta.', 409);
    }

    const { error: upsertErr } = await supabaseAdmin.from('customers').upsert({
      id: user.id,
      email: user.email,
      nome: nome.trim(),
      telefone: telefoneDigits,
      telefone_whatsapp: Boolean(telefoneWhatsapp),
      cpf: cpfDigits,
      endereco_cep: enderecoCep.replace(/\D/g, ''),
      endereco_logradouro: enderecoLogradouro.trim(),
      endereco_numero: enderecoNumero.trim(),
      endereco_complemento: enderecoComplemento?.trim() || null,
      endereco_bairro: enderecoBairro.trim(),
      endereco_cidade: enderecoCidade.trim(),
      endereco_uf: enderecoUf.trim().toUpperCase(),
      cadastro_completo: true,
      updated_at: new Date().toISOString(),
    });

    if (upsertErr) {
      console.error('Erro ao completar cadastro:', upsertErr);
      return errorResponse('Não foi possível salvar seu cadastro. Tente novamente.', 500);
    }

    return jsonResponse({ ok: true, message: 'Cadastro completado com sucesso.' });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao completar cadastro.', 500);
  }
});
