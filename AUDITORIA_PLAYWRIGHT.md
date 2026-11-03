# Auditoria Playwright — Nexus ERP/CRM

**Data:** 03/11/2026

**Checkout:** `main`, após `git pull`, commit `3cde5f2`
**Ambiente exercitado:** Vite local em `http://127.0.0.1:4178`, Playwright `1.64.1` e Chromium. As chamadas Supabase dos testes foram interceptadas e responderam com dados fictícios.

## Resumo executivo

A auditoria completa solicitada **não pôde ser concluída**: o checkout não tinha infraestrutura Playwright e não há configuração `.env.local` nem contas/dados de homologação disponíveis. Foi instalada a infraestrutura de teste no repositório e executada uma suíte E2E local de seis casos. Os seis passaram na execução final. Esses casos verificam telas e respostas da interface com backend simulado; não validam autenticação real, persistência, RLS ou isolamento no banco.

O typecheck e o build do workspace passaram. Não houve acesso ou alteração no Supabase, deploy ou teste em produção. Nenhum segredo foi lido ou inserido nos testes.

## Contagem

- **Aprovados:** 6 casos E2E locais, incluindo a validação das cinco resoluções na mesma execução.
- **Reprovados:** 0 na execução final. Durante a criação da suíte foram corrigidos os seletores/stubs e uma falha de acessibilidade descrita abaixo; os testes foram repetidos depois das correções.
- **Bloqueados:** 11 grupos funcionais/de segurança que dependem de ambiente, contas ou dados de homologação reais. A lista está na seção [Cobertura bloqueada](#cobertura-bloqueada).

## Funcionalidades exercitadas no navegador

| Caso | Resultado observado | Limite |
|---|---|---|
| Tela de login do cliente e abertura do formulário de cadastro | A tela apareceu e a aba abriu | Cadastro não enviado ao Supabase |
| Tela de login administrativo | Modo, texto e campo administrativo apareceram | Nenhuma conta administrativa autenticada |
| Proteção da rota `/cardapio` | Sem sessão, retornou à tela de login | Sessão fornecida por autenticação real não foi exercitada |
| Credenciais inválidas | Interface recusou o login e permaneceu na rota | Respostas de login foram simuladas pelo teste |
| Token público de acompanhamento inválido | Interface mostrou “Pedido não encontrado” e não exibiu dados pessoais fictícios | Token válido, pedido real e isolamento entre pedidos não foram testados |
| Responsividade da tela de login | Sem rolagem horizontal em 1920×1080, 1366×768, 768×1024, 390×844 e 360×800 | As demais páginas e estados de modal/tabela não foram cobertos |

### Evidências

- [Login desktop](test-results/evidence/login-desktop.png)
- [Login em 360×800](test-results/evidence/login-mobile-360x800.png)
- [Acompanhamento com token inválido](test-results/evidence/tracking-invalid-token.png)
- Em falhas futuras, Playwright guarda screenshot, trace e vídeo em `test-results/`; o relatório HTML fica em `playwright-report/`. Esses diretórios estão no `.gitignore`.

## Problemas encontrados e correções

### MÉDIO — rótulos dos campos de autenticação não estavam ligados aos inputs

Os textos visíveis de e-mail e senha não tinham `htmlFor`/`id`. O navegador e tecnologia assistiva não conseguiam associar os rótulos aos controles; os seletores acessíveis do E2E também não localizavam os campos. Foram associados os rótulos aos inputs de login e cadastro, sem alteração visual. A suíte E2E final passou usando esses nomes acessíveis.

### BAIXO — duas migrações recriam a mesma função de checkout

As migrações `20261103113600_reject_inactive_product_modifiers_and_bound_promotions.sql` e `20261103113614_reject_inactive_product_modifiers_and_bound_promotions.sql` têm corpo idêntico; a diferença observada é apenas um comentário. A segunda execução de `CREATE OR REPLACE FUNCTION` é idempotente, mas a duplicidade aumenta a ambiguidade de manutenção. Não alterei o histórico nem apliquei migrações.

Nenhum defeito crítico ou alto foi confirmado pelos testes executados. Isso não equivale a uma auditoria de segurança aprovada: os controles do backend não puderam ser atacados/verificados em execução sem um ambiente de homologação.

## Revisão estática de segurança e arquitetura

O workspace contém 26 diretórios de Edge Functions e 17 arquivos de migração. A inspeção textual local encontrou uso de validação de usuário e filtros por `establishment_id` em funções operacionais, mas não foi uma revisão linha a linha de todas as actions e políticas. Não consultei o banco remoto, não validei as policies RLS efetivas, não manipulei IDs contra endpoints reais e não testei rate limiting, concorrência ou service role em runtime.

Os seis identificadores de modelos de cardápio (`modern-dark`, `minimal`, `editorial`, `vibrant`, `luxury`, `compact`) aparecem no catálogo de templates. A renderização e persistência de cada modelo ficaram bloqueadas por falta de sessão e dados de teste.

## Cobertura bloqueada

Cada item abaixo requer ambiente Supabase isolado e contas/dados fictícios apropriados; nenhum está marcado como aprovado:

1. Login real de proprietário, funcionário, cliente e administrador; cadastro, recuperação, sessão expirada e logout.
2. Listagem, cadastro, onboarding, edição, configuração e permissões de estabelecimentos.
3. CRUD de produtos e categorias, imagens, variantes, adicionais e renderização/persistência dos seis modelos.
4. Carrinho, checkout, preços, pagamento, idempotência, estoque concorrente e snapshots dos pedidos.
5. Acompanhamento com token válido, QR Code, atualização de status e isolamento entre pedidos.
6. Login de cozinha, fila real, atualização de pedidos e sincronização em tempo real.
7. Movimentos, histórico, insuficiência, concorrência e isolamento de estoque.
8. Cadastro, pesquisa, histórico, interações, fidelidade e isolamento de clientes no CRM.
9. Transações, receitas, despesas, indicadores, filtros e permissões financeiras.
10. Autorização real por função, isolamento entre tenants, RLS, manipulação de IDs, validação server-side, rate limiting e uso de service role.
11. Responsividade das telas de cozinha, painéis, produtos, tabelas, formulários e modais.

## Validação e reprodução

Comandos executados no checkout `Nexus-ERP-CRM`:

```text
pnpm run typecheck       — passou
pnpm run test:e2e        — 6 passaram
pnpm run build           — passou
git diff --check         — passou, sem erro de whitespace
```

A suíte usa chaves/endereço fictícios definidos em `playwright.config.ts`, respostas interceptadas e o servidor Vite local. Para a próxima etapa, configure um projeto Supabase de homologação separado, crie contas e dados sintéticos para cada função, então amplie os cenários para persistência e isolamento. Não use o projeto de produção para esses testes.

## Estado do Git

Não houve commit, push ou deploy. Foi preservado o arquivo não rastreado preexistente `catalogo_falhas_seguranca_vibe_coding.md`. As únicas alterações desta auditoria estão no checkout Nexus ERP/CRM.
