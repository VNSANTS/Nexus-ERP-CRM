-- Add optional, tenant-scoped catalog copy for the public menu.
-- Existing products remain valid and receive an empty description.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.products.description IS
  'Descrição opcional exibida no cardápio público; limite de 500 caracteres validado pela Edge Function.';
