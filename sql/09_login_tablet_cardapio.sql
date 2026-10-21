-- 09_login_tablet_cardapio.sql
--
-- Login de tablet/totem do cardápio: uma credencial pertencente ao
-- ESTABELECIMENTO (não a uma pessoa), usada para configurar um
-- dispositivo físico que fica fixo mostrando o cardápio (modo kiosk).
-- Cada estabelecimento pode ter vários dispositivos, cada um com seu
-- próprio código. Sem saída pelo próprio tablet — só o dono consegue
-- revogar/encerrar a sessão remotamente (via painel ADM, etapa futura).
-- Idempotente. Rodar uma única vez no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS establishment_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  codigo text NOT NULL UNIQUE, -- 6 dígitos, único em toda a plataforma
  apelido text, -- ex: "Tablet balcão", "Totem entrada" — opcional, definido pelo dono
  password_hash text NOT NULL, -- PBKDF2, não via Supabase Auth (não é uma pessoa logando)
  ativo boolean NOT NULL DEFAULT true,
  revoked_at timestamptz, -- preenchido quando o dono revoga a sessão remotamente
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS establishment_devices_establishment_id_idx
  ON establishment_devices (establishment_id);

ALTER TABLE establishment_devices ENABLE ROW LEVEL SECURITY;

-- Sem policies públicas: toda leitura/escrita passa por Edge Functions com
-- service_role (mesmo padrão já usado no restante do projeto) — o device
-- em si nunca acessa a tabela diretamente, só troca o código+senha por um
-- token de sessão próprio via Edge Function.

-- Verificação rápida:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'establishment_devices' ORDER BY column_name;
