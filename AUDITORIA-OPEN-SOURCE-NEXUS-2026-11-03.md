# Auditoria comparativa — Nexus ERP x projetos open source
**Data:** 03/11/2026  
**Branch auditada:** `main`  
**Commit auditado:** `f14535cde29055d09fcf602bb01c1c7342b316cb`

## Objetivo
Comparar a base atual do Nexus ERP/CRM com projetos públicos de gestão para restaurantes e cantinas, identificar práticas aproveitáveis e registrar um roteiro de evolução sem importar sistemas inteiros nem comprometer a arquitetura atual.

## Resumo executivo
O Nexus já tem uma base funcional própria: aplicação React/Vite/TypeScript, Supabase, Edge Functions, isolamento por estabelecimento, autenticação de funcionários/clientes, cardápio público, pedidos, cozinha, estoque por produto, promoções, fidelidade/CRM, relatórios e personalização do cardápio.

A principal oportunidade encontrada não é substituir o Nexus. É aprofundar a operação de alimentos e bebidas: ficha técnica/receitas com baixa de ingredientes, adicionais e variações, estados por item na cozinha, sessões e fechamento de caixa, histórico/auditoria de ações e testes de fluxos críticos.

**Recomendação:** manter Supabase como backend e evoluir em módulos pequenos, com migrations explícitas, RLS/Edge Functions preservadas e testes de regressão. Não copiar código de projetos com licença incompatível ou ausente.

## Projetos analisados

### 1. FloCafe — referência operacional principal
- Repositório: https://github.com/FreeOpenSourcePOS/FloCafe
- Licença confirmada no GitHub e no arquivo LICENSE: MIT.
- Pontos estudados: inventário, receitas, modificadores, KDS, sessões/fechamento de caixa, movimentos de gaveta, pedidos e testes E2E.
- O projeto tem implementação dedicada para receitas e inventário, rotas separadas para caixa/KDS e uma suíte extensa de testes de integração.
- É a melhor referência para estudar fluxos operacionais e padrões de teste. Reutilização de código MIT é possível desde que avisos/licença sejam preservados e dependências sejam verificadas individualmente.

### 2. ElitaleRestro — referência de domínio e organização
- Repositório: https://github.com/elitale/restro
- Licença confirmada: GNU AGPL-3.0.
- Pontos estudados: separação UI → actions → services → repositories → DB; modelos explícitos para categorias, produtos, variantes, grupos de adicionais, pedidos, linhas de pedido, receitas e componentes de receita; testes de serviços e repositórios.
- É excelente para estudar modelagem e separação de responsabilidades.
- **Não importar código para o Nexus sem uma análise jurídica/licença específica.** A AGPL tem obrigações de disponibilização do código-fonte de versões modificadas oferecidas como serviço de rede.

### 3. QRMenu — referência conceitual para cardápio e Supabase
- Repositório: https://github.com/Asror-hub/QRMenu
- O repositório não declara uma licença open source reconhecida na API do GitHub e o README informa direitos reservados.
- Pontos estudados apenas como referência conceitual: menu público conectado ao painel, atualizações em tempo real, QR Code, acompanhamento do pedido, painel web e app de equipe.
- **Não copiar nem incorporar código ou assets.** Usar apenas ideias gerais de produto e fluxos.

## Comparação com o Nexus

| Domínio | Situação encontrada no Nexus | Referência útil | Prioridade |
|---|---|---|---|
| Cardápio público | Já existe, com categorias, produtos, imagens, promoções, temas e checkout | QRMenu (conceitos) + FloCafe | Alta — qualidade UX e detalhe do produto |
| Multiestabelecimento | Isolamento por estabelecimento nas migrations e Edge Functions | Manter desenho atual | Crítico — não regredir |
| Pedidos/checkout | Edge Function `pedidos`; checkout chama RPC `checkout_order_atomic`; valida carrinho, limite, pagamento e idempotência; tracking por token | FloCafe / Restro | Alta — expandir estados e auditoria por item |
| Cozinha | Existe painel `Kitchen.tsx` e fluxo de status do pedido | FloCafe KDS | Alta — avaliar estados por item, prioridade e tempo de preparo |
| Estoque | Existe saldo por produto, entrada, desperdício e mínimo; checkout faz baixa do produto | FloCafe / Restro | Muito alta — ficha técnica e ingredientes |
| Receitas/ficha técnica | Não localizei módulo, migration ou função de receitas/componentes no repositório auditado | FloCafe `main/routes/recipes.ts`; Restro `recipe.actions.ts` e `recipe.repository.ts` | Muito alta |
| Variações e adicionais | Não localizei módulo próprio de variantes/grupos de modificadores no Nexus | FloCafe modifiers; Restro MenuItemVariant/ModifierGroup | Alta |
| Caixa | Há checkout, transações e relatórios; não localizei estrutura própria de sessão/abertura/fechamento de caixa nas migrations/paths verificados | FloCafe cash sessions/closures | Alta |
| Mesas/comandas | Não localizei módulo de mesas/planta no Nexus | FloCafe floor plan; Restro DiningTable | Média — depende do público-alvo |
| CRM/fidelidade | Já existe fidelidade, contas de clientes e insights | Restro/QRMenu como comparação de fluxo | Média — enriquecer sem duplicar |
| Testes | Há workflow de typecheck/build; precisa mapear cobertura específica dos fluxos críticos | FloCafe e Restro têm testes dedicados de pedidos, cozinha, inventário e receitas | Crítica |
| Segurança | Há RLS, Edge Functions privilegiadas, rate limiting, autenticação e migrations de endurecimento | Preservar desenho atual | Crítico |

## Achados técnicos concretos no Nexus

### Pontos fortes a preservar
1. `supabase/functions/pedidos/index.ts` centraliza o fluxo público de menu/checkout/tracking e exige autenticação de funcionário para ações operacionais.
2. O checkout delega a operação atômica para `checkout_order_atomic`, com chave de idempotência e validação de itens/quantidades.
3. `supabase/functions/estoque/index.ts` valida quantidades e impede registrar desperdício maior que o saldo disponível.
4. `supabase/functions/gerenciar-dados/index.ts` centraliza ações administrativas e verifica permissões por módulo.
5. Migrations existentes tratam isolamento multi-tenant, leitura pública, upload de imagens, checkout atômico, insights de clientes, branding e permissões.
6. O README estabelece corretamente que chaves privilegiadas não devem ir para variáveis públicas `VITE_*`.

### Lacunas e riscos a tratar
1. **Estoque por produto não equivale a estoque por ingrediente.** A baixa atual do checkout é baseada na quantidade do produto vendido. Para uma cantina, vender um combo ou um salgado deve poder consumir ingredientes/insumos definidos numa ficha técnica, se esse nível de controle fizer parte do escopo.
2. **Falta um modelo explícito de receita/componentes** no código e migrations localizados. Sem isso, não é seguro implementar baixa automática de ingredientes apenas no frontend.
3. **Variações e adicionais precisam de modelo de domínio.** Não basta acrescentar campos soltos na tela: cada opção deve ter preço, regras de seleção, disponibilidade e impacto em estoque quando aplicável.
4. **Estados de pedido parecem estar centrados no pedido inteiro.** Um KDS mais completo pode exigir estados e tempos por item/linha, mantendo o estado agregado do pedido compatível com o fluxo atual.
5. **Caixa e transações não são a mesma coisa.** Para fechamento confiável, é necessário representar sessão de caixa, saldo inicial, entradas/saídas, pagamentos por método, divergência e fechamento, com trilha de auditoria.
6. **Há código legado em `artifacts/api-server/src/routes` que ainda usa Drizzle e lógica antiga de checkout/estoque.** O README atual aponta Supabase Edge Functions como backend ativo. Antes de reaproveitar qualquer trecho desse servidor legado, confirmar se ele é executado em algum ambiente; evitar manter duas fontes de verdade.
7. **Cobertura de testes deve ser vinculada aos invariantes do negócio.** Especialmente checkout concorrente, idempotência, estoque insuficiente, cancelamento/estorno, permissões entre estabelecimentos e transições da cozinha.

## Plano recomendado — arquivo/módulo por arquivo

### Etapa 1 — inventário e testes de segurança (antes de novas funcionalidades)
- `supabase/functions/pedidos/index.ts`: mapear todas as ações, transições permitidas e validações; adicionar testes para checkout repetido, carrinho inválido, produto indisponível, estoque insuficiente e tracking.
- `supabase/migrations/20261030143711_make_order_checkout_atomic.sql`: revisar invariantes da RPC e garantir que alterações futuras de estoque/receitas permaneçam dentro da mesma transação.
- `supabase/functions/_shared/helpers.ts`: mapear permissões por função e módulo; não ampliar privilégios por conveniência.
- `supabase/migrations/*`: manter migrations incrementais; nunca editar migrations já aplicadas em produção.

### Etapa 2 — ficha técnica e estoque por ingrediente
- Criar entidades próprias para insumos/ingredientes, unidades de medida, conversões, receitas e componentes da receita.
- Ligar produtos/variantes às receitas.
- Registrar movimentos de estoque com tipo, quantidade, unidade, custo, motivo, origem e referência ao pedido.
- Fazer a baixa no backend/RPC transacional, não no navegador.
- Definir política de arredondamento, rendimento, desperdício, estoque negativo e conversão de unidades antes da migration.
- Referência de implementação: FloCafe `main/routes/recipes.ts`, `main/routes/inventory.ts`, `frontend/src/lib/addon-inventory.ts`; Restro `src/actions/recipe.actions.ts` e `src/repositories/recipe.repository.ts`.

### Etapa 3 — variantes e adicionais
- Modelar grupos de adicionais com mínimo/máximo, obrigatoriedade, ordem e opções com acréscimo de preço.
- Registrar no item do pedido um snapshot do nome, preço e opções escolhidas para preservar histórico.
- Atualizar menu, carrinho, checkout, pedido de cozinha e relatórios em conjunto.
- Referência: FloCafe modifiers e Restro `MenuItemVariant`, `ModifierGroup`, `Modifier` e `MenuItemModifierGroup`.

### Etapa 4 — cozinha e operação
- Avaliar estados por linha do pedido, tempo decorrido, prioridade, observações e agrupamento por estação.
- Preservar estados atuais e criar mapeamento de compatibilidade para não quebrar tracking.
- Adicionar testes de transição e sincronização.
- Referência: FloCafe `frontend/src/components/kds/`, `main/routes/kds.ts` e `docs/architecture/order-lifecycle.md`.

### Etapa 5 — caixa e fechamento
- Modelar abertura de caixa, sessão, movimentos manuais, sangria/suprimento, pagamentos vinculados, fechamento e divergência.
- Separar valor esperado de valor contado e manter auditoria.
- Só depois conectar dashboard e relatórios.
- Referência: FloCafe `main/routes/cash-sessions.ts`, `main/routes/cash-closures.ts`, `frontend/src/hooks/useCashSession.ts` e `useCashClose.ts`.

### Etapa 6 — mesas/comandas (opcional)
- Implementar apenas se o Nexus realmente atender estabelecimentos com consumo em mesa.
- Se entrar no escopo: mesa, QR individual, comanda, transferência/mesclagem e divisão de conta.
- Referência: FloCafe floor plan e Restro `DiningTable`.

## Regras de integração
- Não importar o banco, autenticação ou arquitetura inteira de outro projeto.
- Não trocar Supabase/Edge Functions por Prisma/Next.js/Electron.
- Não copiar código do QRMenu (sem licença declarada) nem incorporar código AGPL do Restro sem decisão consciente de licenciamento.
- Código MIT do FloCafe pode ser avaliado individualmente, preservando avisos de copyright e verificando dependências/licenças; preferir reimplementar padrões quando a adaptação for pequena.
- Não fazer alterações em produção ou migrations nesta etapa de auditoria.
- Antes de qualquer implementação, conferir o estado atual da branch e do workflow.

## Referências
- FloCafe: https://github.com/FreeOpenSourcePOS/FloCafe
- FloCafe — receitas: https://github.com/FreeOpenSourcePOS/FloCafe/blob/main/main/routes/recipes.ts
- FloCafe — sessões de caixa: https://github.com/FreeOpenSourcePOS/FloCafe/blob/main/main/routes/cash-sessions.ts
- FloCafe — fechamento: https://github.com/FreeOpenSourcePOS/FloCafe/blob/main/main/routes/cash-closures.ts
- ElitaleRestro: https://github.com/elitale/restro
- ElitaleRestro — schema: https://github.com/elitale/restro/blob/main/prisma/schema.prisma
- QRMenu: https://github.com/Asror-hub/QRMenu
- Nexus: https://github.com/VNSANTS/Nexus-ERP-CRM
