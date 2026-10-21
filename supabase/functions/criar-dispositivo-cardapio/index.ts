// supabase/functions/criar-dispositivo-cardapio/index.ts
//
// Gera um novo login de tablet/totem para o cardápio do estabelecimento:
// um código de 6 dígitos (único em toda a plataforma) + senha escolhida
// pelo dono. Usado para configurar um dispositivo físico fixo no balcão,
// que entra em modo kiosk (só mostra o cardápio, sem navegação).
//
// Autenticação: Bearer token do dono (establishment_owners) OU de um
// funcionário com acesso_adm=true no mesmo estabelecimento.
//
// Body esperado: { apelido?, senha }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2$${salt}$${hashHex}`;
}

function gerarCodigo(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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

  let establishmentId: string | null = null;

  const { data: owner } = await supabase
    .from('establishment_owners')
    .select('establishment_id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (owner) {
    establishmentId = owner.establishment_id;
  } else {
    const { data: adminEmployee } = await supabase
      .from('employees')
      .select('establishment_id')
      .eq('auth_user_id', userData.user.id)
      .eq('acesso_adm', true)
      .maybeSingle();
    if (adminEmployee) establishmentId = adminEmployee.establishment_id;
  }

  if (!establishmentId) {
    return errorResponse('Acesso negado.', 403);
  }

  try {
    const body = await req.json();
    const { apelido, senha } = body;

    if (typeof senha !== 'string' || senha.length < 8) {
      return errorResponse('A senha deve ter pelo menos 8 caracteres.', 400);
    }

    // Gera um código único (tenta algumas vezes em caso de colisão rara)
    let codigo = '';
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const candidato = gerarCodigo();
      const { data: existing } = await supabase
        .from('establishment_devices')
        .select('id')
        .eq('codigo', candidato)
        .maybeSingle();
      if (!existing) {
        codigo = candidato;
        break;
      }
    }
    if (!codigo) {
      return errorResponse('Não foi possível gerar um código único. Tente novamente.', 500);
    }

    const passwordHash = await hashPassword(senha);

    const { data: device, error: insErr } = await supabase
      .from('establishment_devices')
      .insert({
        establishment_id: establishmentId,
        codigo,
        apelido: apelido?.trim() || null,
        password_hash: passwordHash,
        ativo: true,
      })
      .select('id, codigo, apelido')
      .single();

    if (insErr) throw insErr;

    return jsonResponse({ ok: true, device });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao criar dispositivo.', 500);
  }
});
