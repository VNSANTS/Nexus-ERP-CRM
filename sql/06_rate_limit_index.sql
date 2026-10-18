-- 06_rate_limit_index.sql
--
-- Índice para acelerar as consultas de checkRateLimit (agora usada por
-- solicitar-estabelecimento, customer-login-lookup, customer-signup-step2,
-- listar-estabelecimentos e decidir-solicitacao). Sem esse índice, cada
-- checagem faz um table scan em rate_limit_log, que só cresce com o uso.
-- Idempotente.

CREATE INDEX IF NOT EXISTS rate_limit_log_scope_identifier_created_at_idx
  ON rate_limit_log (scope, identifier, created_at);

-- Opcional, mas recomendado: limpa entradas com mais de 24h periodicamente
-- para a tabela não crescer indefinidamente. Rodar manualmente por agora;
-- pode virar um cron (pg_cron) depois, junto com o de expirar-solicitacoes.
-- DELETE FROM rate_limit_log WHERE created_at < now() - interval '24 hours';

-- Verificação rápida:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'rate_limit_log';
