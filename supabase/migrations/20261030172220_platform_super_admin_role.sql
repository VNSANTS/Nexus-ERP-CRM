ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

UPDATE public.platform_admins
SET is_super_admin = true
WHERE id = 'd23d1869-11f7-4c00-9fe3-dbfcc6d7fdb8';
