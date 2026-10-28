// supabase/functions/_shared/helpers.ts
//
// Utilitários compartilhados por todas as Edge Functions do Nexus-ERP-CRM.
//
// SECURITY: Auth identifies the account; employee role and active status
// are read from the protected employees table, never from editable
// Supabase Auth user_metadata.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// SEGURANÇA: CORS restrito aos domínios reais do projeto, em vez de '*'.
// '*' liberado para qualquer function autenticada por Bearer token não é
// CSRF (CSRF explora credenciais automáticas como cookies, que não é o
// caso aqui), mas facilita exfiltração de dados por um site malicioso caso
// um token vaze por outro vetor (XSS, extensão de navegador comprometida).
// Restringir a origem fecha essa superfície extra sem custo de UX real.
const ALLOWED_ORIGINS = [
  'https://vnsants.github.io',
  'http://localhost:5173', // dev local (Vite)
  'http://localhost:3000',
];

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
    Vary: 'Origin',
  };
}

// Mantido por compatibilidade com código que ainda importa `corsHeaders`
// como objeto estático (sem Origin dinâmico) — usado só no preflight
// genérico quando a request ainda não está disponível no escopo.
export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(camelizeKeys(body)), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Converte recursivamente chaves snake_case (como vêm do Postgres) para
 * camelCase (como o frontend espera). Aplicado automaticamente em toda
 * resposta enviada via jsonResponse.
 */
function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[toCamel(k)] = camelizeKeys(v);
    }
    return out;
  }
  return value;
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

  // Roles in Auth user_metadata are user-editable and cannot authorize actions.
  // Resolve the account through its protected employee record instead.
  const { data: byAuthId, error: authIdError } = await supabase
    .from('employees')
    .select('id, auth_user_id, nome, role, ativo, establishment_id')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  let employee = byAuthId;
  if (!employee && !authIdError) {
    // Older employee accounts use employees.id as their Auth user ID.
    const { data: byId, error: idError } = await supabase
      .from('employees')
      .select('id, auth_user_id, nome, role, ativo, establishment_id')
      .eq('id', data.user.id)
      .maybeSingle();
    if (idError) return null;
    employee = byId;
  }

  // These legacy APIs operate on the original, global canteen tables and
  // do not filter by establishment. Fail closed for tenant-scoped staff.
  if (authIdError || !employee || employee.ativo !== true || employee.establishment_id != null) return null;

  const role: EmployeeClaims['employeeRole'] =
    employee.role === 'admin' ? 'admin' : 'funcionario';

  return {
    employeeId: data.user.id,
    employeeRole: role,
    employeeName: employee.nome ?? '',
  };
}
