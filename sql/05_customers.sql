-- 05_customers.sql
--
-- Cria o cadastro global de clientes (customers) e a tabela de CRM local
-- por estabelecimento (establishment_customers). Rodar uma única vez no
-- SQL Editor do Supabase (projeto phckbsoygqdbkvuxgobr). Idempotente.

-- === customers (global, 1 por pessoa que loga na plataforma) ===
CREATE TABLE IF NOT EXISTS customers (
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

CREATE UNIQUE INDEX IF NOT EXISTS customers_cpf_unique
  ON customers (cpf) WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_telefone_unique
  ON customers (telefone) WHERE telefone IS NOT NULL;

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_own" ON customers;
CREATE POLICY "customers_select_own" ON customers
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "customers_update_own" ON customers;
CREATE POLICY "customers_update_own" ON customers
  FOR UPDATE USING (auth.uid() = id);

-- Inserção feita via Edge Function com service_role (não por RLS direto),
-- porque o registro é criado logo após a confirmação de e-mail, antes de
-- haver qualquer dado de perfil ainda.

-- === establishment_customers (CRM local, 1 por pessoa por estabelecimento) ===
CREATE TABLE IF NOT EXISTS establishment_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  primeira_compra_at timestamptz NOT NULL DEFAULT now(),
  ultima_compra_at timestamptz NOT NULL DEFAULT now(),
  total_pedidos integer NOT NULL DEFAULT 0,
  total_gasto numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, customer_id)
);

ALTER TABLE establishment_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "establishment_customers_select_own" ON establishment_customers;
CREATE POLICY "establishment_customers_select_own" ON establishment_customers
  FOR SELECT USING (auth.uid() = customer_id);

-- Leitura/gestão pelo estabelecimento (dono/funcionário) fica por conta das
-- Edge Functions autenticadas existentes (gerenciar-dados, etc.), não por
-- RLS direto — mesmo padrão já usado no restante do projeto.

-- Verificação rápida:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('customers', 'establishment_customers');
