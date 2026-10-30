import { adminClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/helpers.ts';

const ACCESS_FIELDS: Record<string, string> = {
  acessoCozinha: 'acesso_cozinha', acessoCaixa: 'acesso_caixa', acessoAdm: 'acesso_adm',
  acessoCrm: 'acesso_crm', acessoRelatorios: 'acesso_relatorios', acessoEstoque: 'acesso_estoque',
  acessoFornecedores: 'acesso_fornecedores', acessoProdutos: 'acesso_produtos',
  acessoPromocoes: 'acesso_promocoes', acessoFuncionarios: 'acesso_funcionarios',
  acessoConfiguracoes: 'acesso_configuracoes', acessoDispositivos: 'acesso_dispositivos',
};
const ACCOUNT_COLUMNS = 'id, establishment_id, nome, username, role, ativo, acesso_cozinha, acesso_caixa, acesso_adm, acesso_crm, acesso_relatorios, acesso_estoque, acesso_fornecedores, acesso_produtos, acesso_promocoes, acesso_funcionarios, acesso_configuracoes, acesso_dispositivos';
const OWNER_COLUMNS = 'id, establishment_id, nome_completo, email, acesso_cozinha, acesso_caixa, acesso_adm, acesso_crm, acesso_relatorios, acesso_estoque, acesso_fornecedores, acesso_produtos, acesso_promocoes, acesso_funcionarios, acesso_configuracoes, acesso_dispositivos';
function mapAccount(row: Record<string, any>) {
  return { id: row.id, establishmentId: row.establishment_id, nome: row.nome ?? row.nome_completo ?? '', nomeCompleto: row.nome_completo ?? row.nome ?? '', username: row.username ?? '', email: row.email ?? '', role: row.role ?? 'owner', ativo: row.ativo ?? true, ...Object.fromEntries(Object.entries(ACCESS_FIELDS).map(([key, column]) => [key, row[column] === true])) };
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return errorResponse('Nao autenticado.', 401);
  const supabase = adminClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(authorization.slice(7));
  if (authError || !authData.user) return errorResponse('Sessao invalida ou expirada.', 401);
  const { data: platformAdmin, error: adminError } = await supabase.from('platform_admins').select('id, is_super_admin').eq('id', authData.user.id).maybeSingle();
  if (adminError) return errorResponse('Nao foi possivel validar o acesso administrativo.', 500);
  if (!platformAdmin?.is_super_admin) return errorResponse('Somente o administrador superior pode gerenciar acessos.', 403);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'list') {
      const [establishments, employees, owners] = await Promise.all([
        supabase.from('establishments').select('id, nome_completo, apelido, email, status, onboarding_completo').order('nome_completo'),
        supabase.from('employees').select(ACCOUNT_COLUMNS).order('nome'),
        supabase.from('establishment_owners').select(OWNER_COLUMNS),
      ]);
      if (establishments.error || employees.error || owners.error) throw establishments.error ?? employees.error ?? owners.error;
      return jsonResponse({ ok: true, establishments: (establishments.data ?? []).map((est) => ({ id: est.id, nomeCompleto: est.nome_completo, apelido: est.apelido, email: est.email, status: est.status, onboardingCompleto: est.onboarding_completo, employees: (employees.data ?? []).filter((row) => row.establishment_id === est.id).map(mapAccount), owners: (owners.data ?? []).filter((row) => row.establishment_id === est.id).map(mapAccount) })) });
    }
    const isOwner = body.action === 'update-owner';
    if (isOwner || body.action === 'update-employee') {
      const id = typeof (isOwner ? body.ownerId : body.employeeId) === 'string' ? (isOwner ? body.ownerId : body.employeeId) : '';
      if (!id || (!isOwner && typeof body.ativo !== 'boolean') || Object.keys(ACCESS_FIELDS).some((key) => typeof body[key] !== 'boolean')) return errorResponse('Informe a conta e todas as permissoes.', 400);
      if (isOwner) {
        const { data, error } = await supabase.from('establishment_owners').update(Object.fromEntries(Object.entries(ACCESS_FIELDS).map(([key, column]) => [column, body[key]]))).eq('id', id).select(OWNER_COLUMNS).maybeSingle();
        if (error) throw error;
        if (!data) return errorResponse('Responsavel nao encontrado.', 404);
        return jsonResponse({ ok: true, owner: mapAccount(data) });
      }
      const { data: employee, error } = await supabase.from('employees').select('id, establishment_id, role, ativo, acesso_adm').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!employee) return errorResponse('Funcionario nao encontrado.', 404);
      const nextRole = body.acessoAdm ? 'admin' : 'funcionario';
      if (employee.ativo && employee.acesso_adm && (!body.ativo || !body.acessoAdm)) {
        const { data: admins, error: adminsError } = await supabase.from('employees').select('id').eq('establishment_id', employee.establishment_id).eq('ativo', true).eq('acesso_adm', true);
        if (adminsError) throw adminsError;
        if ((admins ?? []).length <= 1) return jsonResponse({ ok: false, message: 'Mantenha pelo menos um administrador ativo no estabelecimento.' });
      }
      const { data, error: updateError } = await supabase.from('employees').update({ ativo: body.ativo, role: nextRole, ...Object.fromEntries(Object.entries(ACCESS_FIELDS).map(([key, column]) => [column, body[key]])) }).eq('id', id).select(ACCOUNT_COLUMNS).maybeSingle();
      if (updateError) throw updateError;
      if (!data) return errorResponse('Nao foi possivel atualizar as permissoes.', 409);
      return jsonResponse({ ok: true, employee: mapAccount(data) });
    }
    return errorResponse('Acao invalida.', 400);
  } catch (error) {
    console.error('Falha ao gerenciar acessos pela plataforma:', error);
    return errorResponse('Nao foi possivel gerenciar os acessos.', 500);
  }
});
