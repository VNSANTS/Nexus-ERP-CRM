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

**Limitações:** a exportação com `--no-privileges` não inclui GRANT/REVOKE reais, apenas políticas RLS. ACLs de CI são aproximações documentadas e devem ser comparadas separadamente ao catálogo do banco principal. O fluxo HTTP testa a Edge API; os testes Playwright existentes cobrem o navegador, mas a automação navegador → backend real ainda requer execução própria. Tampouco substitui replay integral das 18 migrações a partir de uma baseline histórica verdadeira.

## Condições para integrar/publicar

- [x] Workflow de Auth/JWT/HTTP executado com sucesso real no GitHub Actions ([run 42327252068](https://github.com/VNSANTS/Nexus-ERP-CRM/actions/runs/42327252068)).
- [x] Evidências HTTP de isolamento entre lojas, RLS e pedido → retirada validadas no stack local com dados sintéticos.
- [x] Diferenças de versões reconciliadas **nos arquivos da PR**, sem executar DDL nem editar histórico no remoto.
- [ ] Plano de backup/implantação e rollback revisado para execução em produção; migrar somente após aprovação.
- [ ] Sem novos custos, sem branch paga Supabase, sem alteração no banco remoto antes de aprovação explícita.
- [ ] PR #10 revisada e somente então integrada ao `main`.

**Proibido:** rodar `supabase db reset --linked` ou executar a fixture de CI no banco real.
