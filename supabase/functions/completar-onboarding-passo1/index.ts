// supabase/functions/completar-onboarding-passo1/index.ts
//
// Passo 1 do onboarding do dono: salva/corrige os dados do estabelecimento
// (nome completo, apelido, e-mail usado no cardápio, CPF/CNPJ) depois da
// aprovação. Esses campos já existem em `establishments` como placeholder
// (= dados do dono, copiados na aprovação) — aqui o dono revisa para os
// dados reais do negócio.
//
// Autenticação: Bearer token do dono (precisa constar em
// establishment_owners, vinculado ao establishment_id que está editando).
//
// Body esperado: { nomeCompleto, apelido, email, cpfCnpj }

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

  const { data: owner } = await supabase
    .from('establishment_owners')
    .select('establishment_id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!owner) {
    return errorResponse('Acesso negado.', 403);
  }

  try {
    const body = await req.json();
    const { nomeCompleto, apelido, email, cpfCnpj } = body;

    if (!nomeCompleto?.trim() || !apelido?.trim() || !email?.trim() || !cpfCnpj?.trim()) {
      return errorResponse('Todos os campos são obrigatórios.', 400);
    }
    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return errorResponse('E-mail inválido.', 400);
    }
    if (!isValidCpfCnpj(cpfCnpj)) {
      return errorResponse('CPF ou CNPJ inválido.', 400);
    }

    const { error: updErr } = await supabase
      .from('establishments')
      .update({
        nome_completo: nomeCompleto.trim(),
        apelido: apelido.trim(),
        email: emailNorm,
        cpf_cnpj: cpfCnpj.replace(/\D/g, ''),
        updated_at: new Date().toISOString(),
      })
      .eq('id', owner.establishment_id);

    if (updErr) throw updErr;

    return jsonResponse({ ok: true, message: 'Dados do estabelecimento salvos.' });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao salvar dados do estabelecimento.', 500);
  }
});
