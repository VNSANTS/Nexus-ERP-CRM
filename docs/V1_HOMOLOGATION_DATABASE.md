# Nexus ERP/CRM V1 — homologação de banco (PR #10)

> Estado: CI local Auth/JWT/HTTP aprovado; histórico de versões alinhado na branch. Produção não alterada. A integração ainda depende da validação de implantação e aprovação. Este documento não autoriza deploy.

## Evidência somente de leitura

- Em 2026-11-07, o conector Supabase confirmou PostgreSQL **17.6** e **16** versões em `supabase_migrations.schema_migrations`.
- O esquema `public` foi exportado apenas como DDL, com PostgreSQL 18.6 `pg_dump --schema-only --no-owner --no-privileges --schema=public`. Não há linhas de clientes, Auth, senhas ou dados de produção.
- A fixture revisada em `supabase/tests/fixtures/current_public_schema.sql` contém 27 tabelas e 4 funções. Tokens `\\restrict` do `pg_dump` e a criação redundante do esquema `public` foram removidos.
- A fixture representa o **estado atual** do banco, **não** o esquema legado anterior às migrações de outubro. Jamais executá-la num banco existente.
- SQL de funções, views ou comentários ainda é código interno: revise antes de republicar a fixture para terceiros.

## Divergências históricas e resolução na PR

| Nome antigo na branch | Histórico no banco | Resolução no commit 9f556aa |
| --- | --- | --- |
| `20261030193000_establishment_feature_permissions.sql` | `20261030192212_establishment_feature_permissions` | SQL equivalente conferido; arquivo renomeado para versão 20261030192212 |
| `20261103113600_reject_inactive_product_modifiers_and_bound_promotions.sql` | Sem entrada nessa versão; `20261103113614` consta no banco | Definição SQL normalizada idêntica à versão 20261103113614; duplicata removida |
| `20261103114100_index_product_options_tenant_foreign_keys.sql` | `20261103114052_index_product_options_tenant_foreign_keys` | SQL equivalente conferido; arquivo renomeado para versão 20261103114052 |
| `20261106184508_atomic_order_transitions_and_inventory.sql` | Ausente | Alteração nova da PR #10; testar e aplicar só após aprovação |

**Após o ajuste**, o GitHub tem **17** versões e o remoto **16**; a única versão no GitHub ainda ausente do banco é **20261106184508**. O registro `20261102031048` existe nos dois lados, mas o nome armazenado no remoto difere; **o identificador de versão** é a chave importante. Não confundir divergência de nome com migração pendente.

Também foi confirmado via `pg_proc` que `checkout_order_atomic` já existe no banco principal; `transition_order_atomic` e `move_inventory_atomic` ainda não existem.

## Validação em banco descartável

O workflow `.github/workflows/supabase-local-homologation.yml` prepara um projeto temporário que contém, nessa ordem:

1. Esquema `public` atual, a partir da fixture sem dados.
2. Apenas a migração nova `20261106184508`.
3. ACLs **exclusivamente de CI** para emular o acesso por `service_role`, preservando Auth e as RLS existentes.
4. Supabase Auth real, PostgreSQL 17, PostgREST e Edge Functions com duas lojas e usuários **sintéticos**.

O teste `supabase/tests/homologation-http.mjs` inclui login Auth por senha e JWT, menus por loja, rejeição de produto estrangeiro, checkout idempotente, listagem isolada, rejeição de transição e retirada de outra loja, RLS da Data API e ciclo até `retirado`.

O teste se recusa a rodar fora de `http://localhost:54321`/`http://127.0.0.1:54321`. Não usa conexão, token, senha, URL ou secret de produção.

**Limitações:** a exportação com `--no-privileges` não inclui GRANT/REVOKE reais, apenas políticas RLS. ACLs de CI são aproximações documentadas e devem ser comparadas separadamente ao catálogo do banco principal. O fluxo HTTP testa a Edge API; os testes Playwright existentes cobrem o navegador, mas a automação navegador → backend real ainda requer execução própria. O workflow também executa `live-supabase-smoke.py`, cobrindo navegador Chromium → frontend local → Edge → banco → retirada com dados sintéticos. Isso não substitui teste em dispositivo físico nem replay integral das migrações a partir de uma baseline histórica verdadeira.

## Condições para integrar/publicar

- [x] Workflow de Auth/JWT/HTTP executado com sucesso real no GitHub Actions ([run 42327252068](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42327252068)).
- [x] Evidências HTTP de isolamento entre lojas, RLS e pedido → retirada validadas no stack local com dados sintéticos.
- [x] Diferenças de versões reconciliadas **nos arquivos da PR**, sem executar DDL nem editar histórico no remoto.
- [ ] Plano de backup/implantação e rollback revisado para execução em produção; migrar somente após aprovação.
- [ ] Sem novos custos, sem branch paga Supabase, sem alteração no banco remoto antes de aprovação explícita.
- [ ] PR #10 revisada e somente então integrada ao `main`.

**Proibido:** rodar `supabase db reset --linked` ou executar a fixture de CI no banco real.

## Revisão complementar de 2026-11-07 (sem deploy)

- A execução 42327252068 foi conferida pela API de jobs do GitHub: `local-auth-http` concluiu `success`; inicialização, testes HTTP/JWT e limpeza concluíram `success`.
- O teste de navegador intercepta o domínio publicado e serve os arquivos compilados localmente; chamadas à API só são permitidas para `localhost:54321`. Isso valida o fluxo integrado sem atingir produção.
- **Risco residual de confidencialidade:** embora o dump seja `schema-only`, contém definições internas de funções e políticas. Uma fixture versionada não deve ser tratada como automaticamente sanitizada apenas por não conter linhas de dados. Antes de compartilhar fora do repositório, revisar comentários, literais, funções, grants e políticas.
- **Risco residual de fidelidade:** o dump foi produzido com `--no-privileges`, e os ACLs de CI são sintéticos; a equivalência com os privilégios reais do banco principal ainda precisa de comparação de catálogo somente leitura.
- **Risco residual de implantação:** a migração nova modifica funções transacionais e redefine dinamicamente `checkout_order_atomic` por substituição textual. Antes de aplicar, validar assinatura/definição no banco de destino, plano de backup, rollback testado e janela de implantação. Não aplicar automaticamente.
- **Proteção de CI:** não disponibilizar segredos de produção a eventos `pull_request`; o workflow de homologação deve permanecer restrito a credenciais locais efêmeras.

### Gate de liberação

1. Comparar privilégios reais (`pg_class`, `pg_proc`, `pg_namespace`, `pg_policy` e ACLs) em modo somente leitura com a configuração de CI.
2. Revisar a fixture integralmente para conteúdo sensível ou desnecessário, mantendo o arquivo exclusivamente para CI descartável.
3. Confirmar estado atual da migração pendente e compatibilidade da definição de `checkout_order_atomic` no destino.
4. Preparar e validar backup e rollback antes de qualquer migração de produção.
5. Só depois aprovar merge, implantação e smoke tests pós-deploy. Nenhum destes passos é autorização para alterar produção.

## Auditoria remota de privilégios (2026-11-07; somente leitura)

Consultas de catálogo e Supabase Security Advisors executadas no projeto principal, sem alterações de DDL/DML:

- 27 tabelas `public` com RLS habilitada. As ACLs observadas concedem controle a `postgres` e `service_role`; apenas `customer_accounts` possui `authenticated=rw` e `platform_admins` possui `authenticated=r`. Nenhuma tabela retornou concessão explícita a `anon`.
- Quatro funções existentes (`checkout_order_atomic`, `cleanup_rate_limit_log`, `customer_insights`, `save_product_options`) apresentam ACL `postgres=X` e `service_role=X`, sem execução explícita para `anon` ou `authenticated`.
- Os ACLs de CI para tabelas e funções reproduzem o acesso essencial observado, mas não equivalem a uma comparação integral de `information_schema.role_table_grants`, ACLs de sequências, `default privileges` e privilégios de esquema; essa verificação aprofundada permanece necessária antes do deploy.
- Security Advisors: 25 avisos INFO de RLS habilitada sem política, coerentes com o modelo de acesso fechado via Edge/service role; não interpretar como exposição por si só. Um WARN: proteção contra senhas vazadas desativada. Ver [documentação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Histórico remoto confirmado novamente: 16 versões, terminando em `20261103114052`; migração `20261106184508` continua ausente.

**Decisão:** não alterar Auth nem aplicar migração ao banco principal nesta auditoria. A aprovação de release exige revisão da fixture completa, comparação de privilégios restantes, estratégia de backup/restauração e ensaio de rollback em banco descartável. Os testes de CI aprovados não substituem esses gates.

## Conferência direta do Supabase principal — 2026-11-07

Consulta somente leitura: 27 tabelas public com RLS habilitada; 25 sem políticas explícitas. ACLs das tabelas coincidem com as grants de CI: service_role amplo, authenticated SELECT/UPDATE em customer_accounts e SELECT em platform_admins. Ainda não foi comprovada equivalência completa de ACLs de sequências, funções e schemas.

Quatro funções public presentes: checkout_order_atomic, cleanup_rate_limit_log, customer_insights, save_product_options. Todas restringem EXECUTE a postgres e service_role. cleanup_rate_limit_log é SECURITY DEFINER; as demais são SECURITY INVOKER. A assinatura de checkout_order_atomic e a expressão antiga de lpad correspondem à pré-condição da migração nova.

Advisor: 25 achados informativos rls_enabled_no_policy; um aviso auth_leaked_password_protection (proteção contra senhas vazadas desativada). Avaliar configuração de Auth separadamente.

### Plano proposto de backup, implantação e rollback (não executado)

1. Obter backup restaurável antes do deploy e testar a restauração em ambiente isolado. Não presumir PITR no plano gratuito.
2. Preservar com segurança DDL anterior, ACLs e inventário de migrações; conferir definição/assinatura antes de executar.
3. Após aprovação, aplicar somente a migração 20261106184508; nunca executar a fixture em produção ou editar histórico manualmente.
4. Validar funções, grants, checkout idempotente, estoque, transições, isolamento entre lojas e retirada. Em falha, bloquear a nova rota, revisar migração compensatória e avaliar recuperação de backup com aprovação explícita.
5. Publicar frontend e Edge Functions somente após compatibilidade e aprovação; executar smoke test e monitorar erros.

Gate de produção permanece FECHADO: backup/restauração não foram ensaiados, e a equivalência completa de ACLs ainda requer revisão. Nenhuma alteração remota foi realizada.
