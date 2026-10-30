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
  establishmentId: string;
  isOwner: boolean;
  accessKitchen: boolean;
  accessCashier: boolean;
  accessAdmin: boolean;
  accessCrm: boolean;
  accessReports: boolean;
  accessInventory: boolean;
  accessSuppliers: boolean;
  accessProducts: boolean;
  accessPromotions: boolean;
  accessEmployees: boolean;
  accessSettings: boolean;
  accessDevices: boolean;
};

export function hasEmployeeAccess(caller: EmployeeClaims, access: 'cozinha' | 'caixa' | 'adm'): boolean {
  if (access === 'cozinha') return caller.accessKitchen;
  if (access === 'caixa') return caller.accessCashier;
  return caller.accessAdmin;
}

export type FeatureAccess = 'crm' | 'relatorios' | 'estoque' | 'fornecedores' | 'produtos' | 'promocoes' | 'funcionarios' | 'configuracoes' | 'dispositivos';

export function hasFeatureAccess(caller: EmployeeClaims, feature: FeatureAccess): boolean {
  const access: Record<FeatureAccess, boolean> = {
    crm: caller.accessCrm,
    relatorios: caller.accessReports,
    estoque: caller.accessInventory,
    fornecedores: caller.accessSuppliers,
    produtos: caller.accessProducts,
    promocoes: caller.accessPromotions,
    funcionarios: caller.accessEmployees,
    configuracoes: caller.accessSettings,
    dispositivos: caller.accessDevices,
  };
  return access[feature];
}

export function adminClient(): SupabaseClient<any> {
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

  const employeeColumns = 'id, auth_user_id, nome, role, ativo, establishment_id, acesso_cozinha, acesso_caixa, acesso_adm, acesso_crm, acesso_relatorios, acesso_estoque, acesso_fornecedores, acesso_produtos, acesso_promocoes, acesso_funcionarios, acesso_configuracoes, acesso_dispositivos';
  const { data: byAuthId, error: authIdError } = await supabase
    .from('employees')
    .select(employeeColumns)
    .eq('auth_user_id', data.user.id)
    .maybeSingle();
  if (authIdError) return null;

  let employee = byAuthId;
  if (!employee) {
    const { data: byId, error: idError } = await supabase
      .from('employees')
      .select(employeeColumns)
      .eq('id', data.user.id)
      .maybeSingle();
    if (idError) return null;
    employee = byId;
  }

  if (employee) {
    if (employee.ativo !== true) return null;
    let establishmentId = employee.establishment_id as string | null;

    // Legacy employee rows without a tenant link are accepted only while the
    // project has one active establishment. Tenant-linked employees are
    // validated against their own establishment and remain usable as the SaaS
    // adds more tenants.
    if (!establishmentId) {
      const { data: establishments, error: establishmentsError } = await supabase
        .from('establishments')
        .select('id, status')
        .eq('status', 'ativo')
        .limit(2);
      if (establishmentsError || establishments?.length !== 1) return null;
      establishmentId = establishments[0].id;
    } else {
      const { data: establishment, error: establishmentError } = await supabase
        .from('establishments')
        .select('id')
        .eq('id', establishmentId)
        .eq('status', 'ativo')
        .maybeSingle();
      if (establishmentError || !establishment) return null;
    }

    if (!establishmentId) return null;

    const legacyAdmin = employee.establishment_id == null && employee.role === 'admin';
    const legacyStaff = employee.establishment_id == null && employee.role !== 'admin';
    return {
      employeeId: data.user.id,
      employeeRole: employee.role === 'admin' ? 'admin' : 'funcionario',
      employeeName: employee.nome ?? '',
      establishmentId,
      isOwner: false,
      accessKitchen: legacyAdmin || legacyStaff || employee.acesso_cozinha === true,
      accessCashier: legacyAdmin || legacyStaff || employee.acesso_caixa === true,
      accessAdmin: legacyAdmin || employee.acesso_adm === true,
      accessCrm: employee.acesso_crm === true,
      accessReports: employee.acesso_relatorios === true,
      accessInventory: employee.acesso_estoque === true,
      accessSuppliers: employee.acesso_fornecedores === true,
      accessProducts: employee.acesso_produtos === true,
      accessPromotions: employee.acesso_promocoes === true,
      accessEmployees: employee.acesso_funcionarios === true,
      accessSettings: employee.acesso_configuracoes === true,
      accessDevices: employee.acesso_dispositivos === true,
    };
  }

  const { data: owner, error: ownerError } = await supabase
    .from('establishment_owners')
    .select('establishment_id, acesso_cozinha, acesso_caixa, acesso_adm, acesso_crm, acesso_relatorios, acesso_estoque, acesso_fornecedores, acesso_produtos, acesso_promocoes, acesso_funcionarios, acesso_configuracoes, acesso_dispositivos')
    .eq('id', data.user.id)
    .maybeSingle();
  if (ownerError || !owner) return null;

  const { data: establishment, error: establishmentError } = await supabase
    .from('establishments')
    .select('id, status')
    .eq('id', owner.establishment_id)
    .maybeSingle();
  if (establishmentError || !establishment || establishment.status !== 'ativo') return null;

  return {
    employeeId: data.user.id,
    employeeRole: 'admin',
    employeeName: data.user.user_metadata?.full_name ?? data.user.email ?? 'Administrador',
    establishmentId: establishment.id,
    isOwner: true,
    accessKitchen: owner.acesso_cozinha === true,
    accessCashier: owner.acesso_caixa === true,
    accessAdmin: owner.acesso_adm === true,
    accessCrm: owner.acesso_crm === true,
    accessReports: owner.acesso_relatorios === true,
    accessInventory: owner.acesso_estoque === true,
    accessSuppliers: owner.acesso_fornecedores === true,
    accessProducts: owner.acesso_produtos === true,
    accessPromotions: owner.acesso_promocoes === true,
    accessEmployees: owner.acesso_funcionarios === true,
    accessSettings: owner.acesso_configuracoes === true,
    accessDevices: owner.acesso_dispositivos === true,
  };
}
