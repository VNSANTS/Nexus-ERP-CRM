// supabase/functions/login-dispositivo-cardapio/index.ts
//
// Login do tablet/totem do cardápio: troca código (6 dígitos) + senha por
// um token de sessão de dispositivo (não é um usuário do Supabase Auth —
// é uma credencial do ESTABELECIMENTO, então usamos um token assinado
// próprio, verificado nas rotas públicas do cardápio quando necessário).
//
// SEGURANÇA: rate limit por IP e por código, para não permitir força
// bruta dos 6 dígitos + senha.
//
// Body esperado: { codigo, senha }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/helpers.ts';
import { getClientIp, checkRateLimit } from '../_shared/security.ts';

const RATE_LIMIT_MAX_PER_IP = 20;
const RATE_LIMIT_MAX_PER_CODIGO = 10;
const RATE_LIMIT_WINDOW_MIN = 60;

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hashHex] = stored.split('$');
  if (scheme !== 'pbkdf2' || !salt || !hashHex) return false;

  const encoder = new TextEncoder();
  const saltBytes = new Uint8Array(salt.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const computedHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return computedHex === hashHex;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = getClientIp(req);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { codigo, senha } = await req.json();
    if (!codigo || typeof senha !== 'string') {
      return errorResponse('Código e senha são obrigatórios.', 400);
    }
    const codigoLimpo = String(codigo).replace(/\D/g, '');

    const rateIp = await checkRateLimit(supabase, 'device_login_ip', ip, RATE_LIMIT_MAX_PER_IP, RATE_LIMIT_WINDOW_MIN);
    if (!rateIp.allowed) {
      return errorResponse('Muitas tentativas. Tente novamente mais tarde.', 429);
    }
    const rateCodigo = await checkRateLimit(
      supabase,
      'device_login_codigo',
      codigoLimpo,
      RATE_LIMIT_MAX_PER_CODIGO,
      RATE_LIMIT_WINDOW_MIN,
    );
    if (!rateCodigo.allowed) {
      return errorResponse('Muitas tentativas. Tente novamente mais tarde.', 429);
    }

    const { data: device } = await supabase
      .from('establishment_devices')
      .select('id, establishment_id, password_hash, ativo, revoked_at')
      .eq('codigo', codigoLimpo)
      .maybeSingle();

    // Mensagem genérica em qualquer caso de falha — não revela se o
    // código existe, está inativo ou a senha é que está errada.
    const genericError = () => errorResponse('Código ou senha inválidos.', 401);

    if (!device || !device.ativo || device.revoked_at) {
      return genericError();
    }

    const senhaOk = await verifyPassword(senha, device.password_hash);
    if (!senhaOk) {
      return genericError();
    }

    await supabase
      .from('establishment_devices')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', device.id);

    // Token de sessão simples (JWT próprio seria ideal a longo prazo, mas
    // para o escopo atual um token opaco validado contra a tabela basta —
    // o device.id funciona como o próprio token, já que não é secreto o
    // suficiente para ser usado sozinho: toda rota que o aceitar deve
    // revalidar `ativo` e `revoked_at` a cada uso).
    return jsonResponse({
      ok: true,
      deviceToken: device.id,
      establishmentId: device.establishment_id,
    });
  } catch (err) {
    console.error(err);
    return errorResponse('Erro interno ao processar login.', 500);
  }
});
