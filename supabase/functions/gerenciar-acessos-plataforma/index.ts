import { adminClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return errorResponse('Não autenticado.', 401);

  const supabase = adminClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(authorization.slice(7));
  if (authError || !authData.user) return errorResponse('Sessão inválida ou expirada.', 401);

  const { data: platformAdmin, error: adminError } = await supabase
    .from('platform_admins')
    .select('id, is_super_admin')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (adminError) return errorResponse('Não foi possível validar o acesso administrativo.', 500);
  if (!platformAdmin?.is_super_admin) return errorResponse('Somente o administrador superior pode gerenciar acessos dos estabelecimentos.', 403);

  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === 'list') {
      const [establishments, employees, owners] = await Promise.all([
        supabase.from('establishments')
          .select('id, nome_completo, apelido, email, status, onboarding_completo')
          .order('nome_completo'),
        supabase.from('employees')
          .select('id, establishment_id, nome, username, role, ativo, acesso_cozinha, acesso_caixa, acesso_adm')
          .order('nome'),
        supabase.from('establishment_owners')
          .select('id, establishment_id, nome_completo, email'),
      ]);
      if (establishments.error || employees.error || owners.error) {
        throw establishments.error ?? employees.error ?? owners.error;
      }

      const employeesByEstablishment = new Map<string, typeof employees.data>();
      for (const employee of employees.data ?? []) {
        const current = employeesByEstablishment.get(employee.establishment_id) ?? [];
        current.push(employee);
        employeesByEstablishment.set(employee.establishment_id, current);
      }
      const ownersByEstablishment = new Map<string, typeof owners.data>();
      for (const owner of owners.data ?? []) {
        const current = ownersByEstablishment.get(owner.establishment_id) ?? [];
        current.push(owner);
        ownersByEstablishment.set(owner.establishment_id, current);
      }

      return jsonResponse({
        ok: true,
        establishments: (establishments.data ?? []).map((establishment) => ({
          ...establishment,
          employees: employeesByEstablishment.get(establishment.id) ?? [],
          owners: ownersByEstablishment.get(establishment.id) ?? [],
        })),
      });
    }

    if (body.action === 'update-employee') {
      const employeeId = typeof body.employeeId === 'string' ? body.employeeId : '';
      if (!employeeId || typeof body.ativo !== 'boolean' ||
        typeof body.acessoCozinha !== 'boolean' || typeof body.acessoCaixa !== 'boolean' ||
        typeof body.acessoAdm !== 'boolean') {
        return errorResponse('Informe o funcionário e todas as permissões.', 400);
      }

      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('id, establishment_id, role, ativo, acesso_cozinha, acesso_caixa, acesso_adm')
        .eq('id', employeeId)
        .maybeSingle();
      if (employeeError) throw employeeError;
      if (!employee) return errorResponse('Funcionário não encontrado.', 404);

      // Administração representa acesso total no modelo atual.
      const accessAdmin = body.acessoAdm as boolean;
      const accessKitchen = accessAdmin || body.acessoCozinha === true;
      const accessCashier = accessAdmin || body.acessoCaixa === true;
      const nextRole = accessAdmin ? 'admin' : 'funcionario';

      if (employee.ativo && employee.acesso_adm && (!body.ativo || !accessAdmin)) {
        const { data: activeAdmins, error: activeAdminsError } = await supabase
          .from('employees')
          .select('id')
          .eq('establishment_id', employee.establishment_id)
          .eq('ativo', true)
          .eq('acesso_adm', true);
        if (activeAdminsError) throw activeAdminsError;
        if ((activeAdmins ?? []).length <= 1) {
          return jsonResponse({ ok: false, message: 'Mantenha pelo menos um administrador ativo no estabelecimento.' });
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from('employees')
        .update({
          ativo: body.ativo,
          role: nextRole,
          acesso_cozinha: accessKitchen,
          acesso_caixa: accessCashier,
          acesso_adm: accessAdmin,
        })
        .eq('id', employeeId)
        .eq('establishment_id', employee.establishment_id)
        .select('id, establishment_id, nome, username, role, ativo, acesso_cozinha, acesso_caixa, acesso_adm')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return errorResponse('Não foi possível atualizar as permissões.', 409);

      console.info('Permissões de funcionário atualizadas pelo NXS', {
        platformAdminId: authData.user.id,
        employeeId,
        establishmentId: employee.establishment_id,
      });
      return jsonResponse({ ok: true, employee: updated });
    }

    return errorResponse('Ação inválida.', 400);
  } catch (error) {
    console.error('Falha ao gerenciar acessos pela plataforma:', error);
    return errorResponse('Não foi possível gerenciar os acessos.', 500);
  }
});
