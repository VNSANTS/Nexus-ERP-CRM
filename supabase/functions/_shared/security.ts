// supabase/functions/_shared/security.ts
//
// Rate limiting e verificação de CAPTCHA (Cloudflare Turnstile), usados
// pelos formulários públicos do Nexus (solicitação de estabelecimento,
// login, cadastro de cliente).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Extrai o IP do requisitante. No Supabase Edge Functions (roda sobre
 * Deno Deploy), o IP real vem no header x-forwarded-for.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? 'unknown';
}

/**
 * Verifica se `identifier` (geralmente o IP) excedeu `maxRequests` dentro
 * dos últimos `windowMinutes` minutos, para o `scope` dado. Se não excedeu,
 * registra a tentativa atual e retorna { allowed: true }.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  scope: string,
  identifier: string,
  maxRequests: number,
  windowMinutes: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { count } = await supabase
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('scope', scope)
    .eq('identifier', identifier)
    .gte('created_at', windowStart);

  const current = count ?? 0;
  if (current >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  await supabase.from('rate_limit_log').insert({ scope, identifier });
  return { allowed: true, remaining: maxRequests - current - 1 };
}

/**
 * Verifica um token do Cloudflare Turnstile (CAPTCHA) contra a API da
 * Cloudflare. Retorna true se o humano passou no desafio.
 */
export async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) {
    console.error('TURNSTILE_SECRET_KEY não configurada.');
    return false;
  }
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token, remoteip: remoteIp });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data = await res.json();
  return data.success === true;
}
