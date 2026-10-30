-- Brand assets and editable colors belong to each establishment's settings row.
-- Defaults preserve the existing warm cream and orange cardapio appearance.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS menu_primary_color text NOT NULL DEFAULT '#ff6600',
  ADD COLUMN IF NOT EXISTS menu_background_color text NOT NULL DEFAULT '#f7f3ed';
