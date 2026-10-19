-- 07_painel_admin.sql
--
-- Cria a base do Painel de Administração da Nexus (rota /painel-raiz):
-- quem é admin da plataforma (platform_admins) e a lista de identificadores
-- bloqueados (blocked_identifiers), usada tanto para solicitações de
-- estabelecimento quanto, no futuro, para clientes comuns.
-- Idempotente. Rodar uma única vez no SQL Editor do Supabase.

-- === platform_admins ===
-- Se o id do usuário logado está aqui, ele é admin da plataforma Nexus
-- (dono/equipe interna). Não tem Sign up: é inserido manualmente por você.
CREATE TABLE IF NOT EXISTS platform_admins (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_select_own" ON platform_admins;
CREATE POLICY "platform_admins_select_own" ON platform_admins
  FOR SELECT USING (auth.uid() = id);

-- Nenhuma policy de INSERT/UPDATE/DELETE: só o service_role (usado pelas
-- Edge Functions, ou você direto no SQL Editor) pode promover alguém a
-- admin. Evita que um cliente comum se autopromova via API.

-- === blocked_identifiers ===
-- Bloqueio de CPF/CNPJ e/ou e-mail, usado para impedir novas solicitações
-- de estabelecimento (e, no futuro, cadastros de cliente comum).
-- tipo: 'cpf_cnpj' | 'email'
-- contexto: 'establishment_request' | 'customer' — para onde vale o bloqueio
CREATE TABLE IF NOT EXISTS blocked_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('cpf_cnpj', 'email')),
  valor text NOT NULL,
  contexto text NOT NULL DEFAULT 'establishment_request'
    CHECK (contexto IN ('establishment_request', 'customer')),
  motivo text,
  blocked_by uuid REFERENCES platform_admins(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, valor, contexto)
);

ALTER TABLE blocked_identifiers ENABLE ROW LEVEL SECURITY;

-- Sem policies públicas: só Edge Functions com service_role leem/escrevem
-- aqui. Ninguém de fora precisa (nem deve) consultar essa tabela direto.

CREATE INDEX IF NOT EXISTS blocked_identifiers_lookup_idx
  ON blocked_identifiers (tipo, valor, contexto);

-- Verificação rápida:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('platform_admins', 'blocked_identifiers');
