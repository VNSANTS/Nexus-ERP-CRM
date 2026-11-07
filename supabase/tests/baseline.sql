-- Isolated PostgreSQL fixture for the legacy schema that predates migrations.
-- Never apply this fixture to Supabase or an existing database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE establishments (id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE products (
 id text NOT NULL, establishment_id uuid NOT NULL REFERENCES establishments,
 name text NOT NULL, description text DEFAULT '', price numeric NOT NULL CHECK(price>=0),
 emoji text DEFAULT '', categoria text DEFAULT 'lanche', sazonal boolean DEFAULT false,
 disponivel boolean DEFAULT true, image_url text,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
 PRIMARY KEY(id,establishment_id)
);
CREATE TABLE stock (
 establishment_id uuid NOT NULL, product_id text NOT NULL, name text NOT NULL,
 quantidade integer NOT NULL CHECK(quantidade>=0), minimo integer DEFAULT 0,
 updated_at timestamptz DEFAULT now(), PRIMARY KEY(establishment_id,product_id),
 FOREIGN KEY(product_id,establishment_id) REFERENCES products(id,establishment_id)
);
CREATE TABLE promotions (
 id text PRIMARY KEY, establishment_id uuid NOT NULL REFERENCES establishments,
 tipo text, valor numeric, product_ids text[], ativo boolean, created_at timestamptz DEFAULT now()
);
CREATE TABLE orders (
 id text NOT NULL, establishment_id uuid NOT NULL REFERENCES establishments,
 idempotency_key text NOT NULL, code text NOT NULL, payment_code text NOT NULL,
 total numeric NOT NULL, payment_method text NOT NULL, status text NOT NULL,
 observacoes text DEFAULT '', telefone text DEFAULT '', tracking_token uuid DEFAULT gen_random_uuid(),
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
 PRIMARY KEY(id,establishment_id), UNIQUE(establishment_id,idempotency_key)
);
CREATE TABLE order_items (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 establishment_id uuid NOT NULL, order_id text NOT NULL, product_id text NOT NULL,
 name text NOT NULL, price numeric NOT NULL, qty integer NOT NULL CHECK(qty>0),
 FOREIGN KEY(order_id,establishment_id) REFERENCES orders(id,establishment_id),
 FOREIGN KEY(product_id,establishment_id) REFERENCES products(id,establishment_id)
);
CREATE TABLE transactions (
 id text PRIMARY KEY, establishment_id uuid NOT NULL, order_id text NOT NULL,
 order_code text NOT NULL, method text NOT NULL, valor numeric NOT NULL, status text NOT NULL,
 created_at timestamptz DEFAULT now(),
 FOREIGN KEY(order_id,establishment_id) REFERENCES orders(id,establishment_id)
);
CREATE TABLE daily_counter (
 establishment_id uuid NOT NULL REFERENCES establishments, date text NOT NULL,
 count integer NOT NULL, PRIMARY KEY(establishment_id,date)
);
CREATE TABLE loyalty (
 establishment_id uuid NOT NULL REFERENCES establishments, telefone text NOT NULL,
 pedidos integer NOT NULL, updated_at timestamptz DEFAULT now(), PRIMARY KEY(establishment_id,telefone)
);
CREATE TABLE stock_history (
 id text PRIMARY KEY, establishment_id uuid NOT NULL, product_id text NOT NULL,
 product_name text NOT NULL, quantidade integer NOT NULL, motivo text NOT NULL,
 created_at timestamptz DEFAULT now(),
 FOREIGN KEY(product_id,establishment_id) REFERENCES products(id,establishment_id)
);
CREATE TABLE waste_log (LIKE stock_history INCLUDING ALL);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
