// supabase/functions/_shared/helpers.ts
//
// Utilitários compartilhados por todas as Edge Functions do Nexus-ERP-CRM.
//
// MUDANÇA DE ARQUITETURA: como o projeto usa chaves de assinatura JWT
// assimétricas (ECC), não há mais um "JWT Secret" único para assinar tokens
// à mão. Em vez disso, usamos o Supabase Auth nativo: cada funcionário é um
// usuário em auth.users (e-mail sintético `username@cozinha...internal`), e
// o cargo (admin/funcionario) fica em `raw_user_meta_data`. O Supabase já
// verifica o token sozinho — aqui só decodificamos o usuário autenticado.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function shortCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// E-mail sintético usado para logar funcionários no Supabase Auth a partir
// de um "usuário" simples (sem @), mantendo a mesma UX de login por username.
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@cozinha.nexus-erp-crm.internal`;
}

export type EmployeeClaims = {
  employeeId: string; // = auth.users.id
  employeeRole: 'admin' | 'funcionario';
  employeeName: string;
};

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/**
 * Valida o token do funcionário (emitido pelo próprio Supabase Auth no
 * momento do login) e devolve os claims relevantes. Retorna null se o
 * header estiver ausente ou o token for inválido/expirado.
 */
export async function requireEmployee(req: Request): Promise<EmployeeClaims | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);

  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  const meta = data.user.user_metadata as Record<string, unknown>;
  const role = meta?.role;
  if (role !== 'admin' && role !== 'funcionario') return null;

  return {
    employeeId: data.user.id,
    employeeRole: role,
    employeeName: (meta?.nome as string) ?? '',
  };
}
