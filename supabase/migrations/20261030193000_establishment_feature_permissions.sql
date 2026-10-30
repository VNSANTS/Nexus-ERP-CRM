ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS acesso_crm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_relatorios boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_estoque boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_fornecedores boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_produtos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_promocoes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_funcionarios boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_configuracoes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_dispositivos boolean NOT NULL DEFAULT false;

ALTER TABLE public.establishment_owners
  ADD COLUMN IF NOT EXISTS acesso_cozinha boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_caixa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_adm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_crm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_relatorios boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_estoque boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_fornecedores boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_produtos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_promocoes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_funcionarios boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_configuracoes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_dispositivos boolean NOT NULL DEFAULT true;

UPDATE public.employees
SET acesso_crm = true,
    acesso_relatorios = true,
    acesso_estoque = true,
    acesso_fornecedores = true,
    acesso_produtos = true,
    acesso_promocoes = true,
    acesso_funcionarios = true,
    acesso_configuracoes = true,
    acesso_dispositivos = true
WHERE acesso_adm = true;
