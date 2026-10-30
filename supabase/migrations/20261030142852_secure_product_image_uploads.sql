-- Keep public reads so menu images render, but restrict writes to signed uploads
-- created by gerenciar-dados after employee and tenant authorization.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/webp']::text[]
WHERE id = 'product-images';

DROP POLICY IF EXISTS "funcionarios podem enviar imagens de produto" ON storage.objects;
DROP POLICY IF EXISTS "funcionarios podem atualizar imagens de produto" ON storage.objects;
DROP POLICY IF EXISTS "funcionarios podem remover imagens de produto" ON storage.objects;
