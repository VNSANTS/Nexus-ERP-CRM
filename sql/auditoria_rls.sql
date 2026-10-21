-- auditoria_rls.sql
--
-- Lista todas as tabelas do schema public e se RLS está ativado, mais as
-- policies existentes em cada uma. Rodar no SQL Editor para confirmar que
-- nenhuma tabela ficou sem RLS por falta de versionamento do SQL original.

SELECT
  t.tablename,
  t.rowsecurity AS rls_ativado,
  COUNT(p.policyname) AS total_policies
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public'
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.rowsecurity ASC, t.tablename;
