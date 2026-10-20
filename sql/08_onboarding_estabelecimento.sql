-- 08_onboarding_estabelecimento.sql
--
-- Suporte ao onboarding do dono de estabelecimento após aprovação:
-- - establishments ganha campos que faltavam para o onboarding completo
-- - employees ganha establishment_id (nullable por enquanto — os
--   funcionários do estabelecimento nº1, criados antes do multi-tenant,
--   ficam sem establishment_id até a migração de dados existentes)
-- Idempotente. Rodar uma única vez no SQL Editor do Supabase.

-- === establishments: completar dados do Passo 1 do onboarding ===
-- nome_completo, apelido, email, cpf_cnpj já existem (vieram da aprovação
-- da solicitação, como placeholder = dados do dono). O onboarding permite
-- o dono revisar/corrigir esses campos para os dados reais do negócio.
-- Nenhuma coluna nova necessária aqui — os campos já existem.

-- === employees: isolar por estabelecimento ===
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES establishments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS employees_establishment_id_idx
  ON employees (establishment_id);

-- Permissões do funcionário (Passo 2 do onboarding): substitui o antigo
-- campo `role` livre por um conjunto estruturado de acessos. Mantém
-- `role` por compatibilidade com o painel atual da Cozinha, mas adiciona
-- colunas específicas para o que o dono escolhe no onboarding.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS acesso_cozinha boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_caixa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_adm boolean NOT NULL DEFAULT false;

-- Funcionário vinculado ao login de auth.users (necessário para o login
-- por e-mail/senha usado nos novos estabelecimentos — o painel da Cozinha
-- atual usa e-mail sintético via username, que continua funcionando à
-- parte para o estabelecimento nº1).
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS employees_auth_user_id_unique
  ON employees (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- RLS: leitura/gestão de employees por estabelecimento é feita via Edge
-- Functions autenticadas (service_role), não por RLS direto — mesmo
-- padrão já usado no restante do projeto.

-- Verificação rápida:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'employees' ORDER BY column_name;
