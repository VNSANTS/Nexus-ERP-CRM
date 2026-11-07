# Nexus ERP/CRM V1 — homologação de banco (PR #10)

> Estado: bloqueio de integração até um CI Supabase local **verde** e reconciliação explícita de versões. Este documento não autoriza deploy.

## Evidência somente de leitura

- Em 2026-11-07, o conector Supabase confirmou PostgreSQL **17.6** e **16** versões em `supabase_migrations.schema_migrations`.
- O esquema `public` foi exportado apenas como DDL, com PostgreSQL 18.6 `pg_dump --schema-only --no-owner --no-privileges --schema=public`. Não há linhas de clientes, Auth, senhas ou dados de produção.
- A fixture revisada em `supabase/tests/fixtures/current_public_schema.sql` contém 27 tabelas e 4 funções. Tokens `\\restrict` do `pg_dump` e a criação redundante do esquema `public` foram removidos.
- A fixture representa o **estado atual** do banco, **não** o esquema legado anterior às migrações de outubro. Jamais executá-la num banco existente.
- SQL de funções, views ou comentários ainda é código interno: revise antes de republicar a fixture para terceiros.

## Divergências comprovadas no histórico

| Migração no GitHub | Histórico no banco | Situação |
| --- | --- | --- |
| `20261030193000_establishment_feature_permissions.sql` | `20261030192212_establishment_feature_permissions` | Versões divergentes; verificar conteúdo/equivalência |
| `20261103113600_reject_inactive_product_modifiers_and_bound_promotions.sql` | Sem entrada nessa versão; `20261103113614` consta no banco | Possível revisão intermediária; não reaplicar automaticamente |
| `20261103114100_index_product_options_tenant_foreign_keys.sql` | `20261103114052_index_product_options_tenant_foreign_keys` | Versões divergentes; comparar definições dos índices |
| `20261106184508_atomic_order_transitions_and_inventory.sql` | Ausente | Alteração nova da PR #10; testar e aplicar só após aprovação |

O registro `20261102031048` existe nos dois lados, mas o nome armazenado no remoto difere; **o identificador de versão** é a chave importante. Não confundir divergência de nome com migração pendente.

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

- [ ] Workflow de Auth/JWT/HTTP executado com sucesso real no GitHub Actions, não apenas criado.
- [ ] Evidências de isolamento entre lojas, RLS e pedido → retirada validadas.
- [ ] Diferenças de versões reconciliadas por comparação SQL e catalogação dos efeitos já presentes; nenhuma marcação artificial sem aprovação.
- [ ] Plano de backup e migração incrementais testado no ambiente descartável.
- [ ] Sem novos custos, sem branch paga Supabase, sem alteração no banco remoto antes de aprovação explícita.
- [ ] PR #10 revisada e somente então integrada ao `main`.

**Proibido:** rodar `supabase db reset --linked` ou executar a fixture de CI no banco real.
