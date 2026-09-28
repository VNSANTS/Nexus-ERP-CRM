-- 05_customer_accounts.sql
--
-- Cria o cadastro global de LOGIN da plataforma (customer_accounts) —
-- diferente da tabela `customers` já existente, que é o CRM local usado
-- pelo painel da Cozinha (tags, observações, interações, loyalty).
--
-- IMPORTANTE: por isso a tabela de login se chama `customer_accounts`,
-- não `customers` — `customers` já existe e está em uso ativo pelo
-- Kitchen.tsx. Rodar uma única vez no SQL Editor do Supabase
-- (projeto phckbsoygqdbkvuxgobr). Idempotente.

CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  email text NOT NULL,
  telefone text,
  telefone_whatsapp boolean NOT NULL DEFAULT false,
  cpf text,
  endereco_cep text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_uf text,
  cadastro_completo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_cpf_unique
  ON customer_accounts (cpf) WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_telefone_unique
  ON customer_accounts (telefone) WHERE telefone IS NOT NULL;

ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_accounts_select_own" ON customer_accounts;
CREATE POLICY "customer_accounts_select_own" ON customer_accounts
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "customer_accounts_update_own" ON customer_accounts;
CREATE POLICY "customer_accounts_update_own" ON customer_accounts
  FOR UPDATE USING (auth.uid() = id);

-- Inserção feita via Edge Function com service_role (não por RLS direto),
-- porque o registro é criado logo após a confirmação de e-mail, antes de
-- haver qualquer dado de perfil ainda.

-- Verificação rápida:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'customer_accounts' ORDER BY column_name;
