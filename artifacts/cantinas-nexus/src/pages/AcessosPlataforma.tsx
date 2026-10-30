import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, RefreshCw, Save, ShieldCheck, UserRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

type EmployeeAccess = {
  acessoCozinha: boolean;
  acessoCaixa: boolean;
  acessoAdm: boolean;
  ativo: boolean;
};

type Employee = EmployeeAccess & {
  id: string;
  nome: string;
  username: string;
  role: string;
};

type Establishment = {
  id: string;
  nomeCompleto: string;
  apelido: string;
  email: string;
  status: string;
  onboardingCompleto: boolean;
  employees: Employee[];
  owners: Array<{ id: string; nomeCompleto: string; email: string }>;
};

function accessOf(employee: Employee): EmployeeAccess {
  return {
    acessoCozinha: employee.acessoCozinha,
    acessoCaixa: employee.acessoCaixa,
    acessoAdm: employee.acessoAdm,
    ativo: employee.ativo,
  };
}

export function AcessosPlataforma({ onBack, onSignOut }: { onBack: () => void; onSignOut: () => void }) {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, EmployeeAccess>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerenciar-acessos-plataforma', { body: { action: 'list' } });
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? 'Não foi possível carregar os acessos.');
        return;
      }
      const rows: Establishment[] = data.establishments ?? [];
      setEstablishments(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '');
      setDrafts(Object.fromEntries(rows.flatMap((row) => row.employees.map((employee) => [employee.id, accessOf(employee)]))));
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar os acessos dos estabelecimentos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  const selected = useMemo(() => establishments.find((row) => row.id === selectedId) ?? null, [establishments, selectedId]);

  function alterar(employeeId: string, key: keyof EmployeeAccess) {
    setDrafts((current) => {
      const previous = current[employeeId];
      if (!previous) return current;
      const value = !previous[key];
      if (key === 'acessoAdm' && value) {
        return { ...current, [employeeId]: { ativo: previous.ativo, acessoCozinha: true, acessoCaixa: true, acessoAdm: true } };
      }
      const next = { ...previous, [key]: value };
      if ((key === 'acessoCozinha' || key === 'acessoCaixa') && !value) next.acessoAdm = false;
      return { ...current, [employeeId]: next };
    });
  }

  function temAlteracao(employee: Employee) {
    const draft = drafts[employee.id];
    return !!draft && (draft.ativo !== employee.ativo || draft.acessoCozinha !== employee.acessoCozinha ||
      draft.acessoCaixa !== employee.acessoCaixa || draft.acessoAdm !== employee.acessoAdm);
  }

  async function salvar(employee: Employee) {
    const permissions = drafts[employee.id];
    if (!permissions || !temAlteracao(employee)) return;
    setSavingId(employee.id);
    try {
      const { data, error } = await supabase.functions.invoke('gerenciar-acessos-plataforma', {
        body: { action: 'update-employee', employeeId: employee.id, ...permissions },
      });
      if (error || data?.error || data?.ok === false) {
        toast.error(data?.error ?? data?.message ?? 'Não foi possível salvar as permissões.');
        return;
      }
      setEstablishments((current) => current.map((establishment) => establishment.id !== selectedId ? establishment : {
        ...establishment,
        employees: establishment.employees.map((row) => row.id === employee.id ? data.employee : row),
      }));
      setDrafts((current) => ({ ...current, [employee.id]: accessOf(data.employee) }));
      toast.success(`Acessos de ${employee.nome} atualizados.`);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar as permissões.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#172333] px-6 py-6 text-white shadow-xl sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><ShieldCheck className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-white/60">Nexus · controle central</p>
              <h1 className="text-2xl font-extrabold sm:text-3xl">Acessos e permissões</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15"><ArrowLeft className="h-4 w-4" /> Estabelecimentos</button>
            <button type="button" onClick={() => void carregar()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white/80 hover:bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
            <button type="button" onClick={onSignOut} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/10">Sair</button>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <label htmlFor="establishment-access-select" className="mb-2 block text-sm font-bold text-foreground">Estabelecimento</label>
          <select id="establishment-access-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading || establishments.length === 0} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground outline-none focus:border-primary sm:max-w-xl">
            {establishments.length === 0 && <option value="">Nenhum estabelecimento cadastrado</option>}
            {establishments.map((establishment) => <option key={establishment.id} value={establishment.id}>{establishment.apelido || establishment.nomeCompleto} · {establishment.status}</option>)}
          </select>
          {selected && <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground"><span className="rounded-full bg-muted px-3 py-1.5">{selected.employees.length} funcionários</span><span className={`rounded-full px-3 py-1.5 ${selected.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>Estabelecimento {selected.status}</span><span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">{selected.onboardingCompleto ? 'Cadastro concluído' : 'Cadastro incompleto'}</span></div>}
        </section>

        {loading && <p className="mt-5 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando...</p>}
        {!loading && selected && (
          <>
            <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-relaxed text-blue-900 sm:p-6">
              <div className="flex items-start gap-3"><Building2 className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Acesso do estabelecimento:</strong> use os controles de bloqueio/desbloqueio na tela Estabelecimentos para suspender ou reativar a conta inteira. Aqui você controla as permissões de cada funcionário. O dono mantém acesso total.</p></div>
            </section>

            <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-primary" /><div><h2 className="text-lg font-extrabold text-foreground">Responsáveis do estabelecimento</h2><p className="text-sm text-muted-foreground">A conta do dono tem acesso total para administrar o próprio negócio.</p></div></div>
              {selected.owners.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Nenhum responsável vinculado.</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{selected.owners.map((owner) => <div key={owner.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-foreground">{owner.nomeCompleto}</p><p className="truncate text-xs text-muted-foreground">{owner.email}</p></div><span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Acesso total</span></div>)}</div>}
            </section>

            <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><div><h2 className="text-lg font-extrabold text-foreground">Funcionários e permissões</h2><p className="text-sm text-muted-foreground">As alterações são aplicadas também nas verificações do backend.</p></div></div>
              {selected.employees.length === 0 ? <p className="mt-5 rounded-xl bg-muted/60 p-5 text-sm text-muted-foreground">Este estabelecimento ainda não cadastrou funcionários.</p> : <div className="mt-5 space-y-4">{selected.employees.map((employee) => {
                const draft = drafts[employee.id] ?? accessOf(employee);
                const dirty = temAlteracao(employee);
                return (
                  <article key={employee.id} className="rounded-2xl border border-border p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="font-bold text-foreground">{employee.nome}</h3><p className="mt-0.5 text-sm text-muted-foreground">{employee.username} · {employee.role === 'admin' ? 'Administrador' : 'Funcionário'}</p></div>
                      <button type="button" onClick={() => void salvar(employee)} disabled={!dirty || savingId === employee.id} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"><Save className="h-4 w-4" />{savingId === employee.id ? 'Salvando...' : 'Salvar acessos'}</button>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <PermissionToggle label="Conta ativa" description="Pode entrar no sistema." checked={draft.ativo} onChange={() => alterar(employee.id, 'ativo')} />
                      <PermissionToggle label="Cozinha" description="Pedidos e operação da cozinha." checked={draft.acessoCozinha} onChange={() => alterar(employee.id, 'acessoCozinha')} />
                      <PermissionToggle label="Caixa" description="Caixa e confirmação de pagamento." checked={draft.acessoCaixa} onChange={() => alterar(employee.id, 'acessoCaixa')} />
                      <PermissionToggle label="Administração" description="Acesso total às áreas administrativas." checked={draft.acessoAdm} onChange={() => alterar(employee.id, 'acessoAdm')} />
                    </div>
                    {dirty && <p className="mt-3 text-xs font-semibold text-amber-700">Há alterações não salvas para este funcionário.</p>}
                  </article>
                );
              })}</div>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function PermissionToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${checked ? 'border-primary/35 bg-primary/5' : 'border-border bg-background hover:bg-muted/50'}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 accent-orange-600" />
      <span><span className="block text-sm font-bold text-foreground">{label}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span></span>
    </label>
  );
}
