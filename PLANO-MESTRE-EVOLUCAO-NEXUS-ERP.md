# Plano mestre de evolução — Nexus ERP/CRM
**Data:** 03/11/2026  
**Branch de referência:** `main`  
**Base atual:** `a24f7972e671e65517ae5de43c502cf2ffa0c5fb`  
**Documento relacionado:** [Auditoria Open Source](./AUDITORIA-OPEN-SOURCE-NEXUS-2026-11-03.md)

---

## 1. Objetivo do trabalho

Evoluir o Nexus para um ERP/CRM sólido para cantinas e estabelecimentos de alimentação, sem perder a identidade, a arquitetura e os recursos já implementados.

**Prioridade explícita: entregar um cardápio público muito melhor.** O cardápio é a vitrine do estabelecimento e a primeira experiência de muitos clientes. Ele não será deixado para o final nem tratado como uma simples troca de cores.

O trabalho será feito diretamente no repositório existente, com alterações pequenas o bastante para serem verificadas, mas agrupadas em entregas úteis. Não será criada uma segunda aplicação nem será importado outro ERP inteiro.

## 2. Princípios que vou seguir

1. **Preservar o que já funciona.** Antes de alterar um fluxo, mapear seus contratos, chamadas, estados e dependências.
2. **Cardápio em primeiro plano.** A primeira grande entrega funcional será a reformulação da experiência pública de compra.
3. **Uma fonte de verdade.** Supabase/PostgreSQL, Edge Functions e migrations continuam sendo o backend oficial. Código legado só será reutilizado depois de provar que está ativo e necessário.
4. **Backend decide regras de negócio.** Preços, disponibilidade, estoque, permissões, descontos e checkout não serão confiados ao navegador.
5. **Multiestabelecimento não pode regredir.** Toda leitura, escrita, relatório, arquivo e evento precisa respeitar o estabelecimento correto.
6. **Mudanças de banco são coordenadas.** Toda alteração de schema terá migration incremental, atualização dos tipos/Edge Functions e plano de compatibilidade. Migrations aplicadas não serão reescritas.
7. **Licenças respeitadas.** FloCafe (MIT) é referência para padrões e eventual reutilização pontual com avisos preservados. ElitaleRestro (AGPL-3.0) será referência de arquitetura/domínio, sem copiar código sem decisão específica de licenciamento. QRMenu, sem licença open source declarada, será usado apenas como referência conceitual.
8. **Nada será declarado concluído só porque compilou.** Build, tipos, fluxos reais e comportamento em telas pequenas precisam ser verificados.

## 3. Ordem geral das entregas

| Ordem | Etapa | Resultado esperado | Prioridade |
|---|---|---|---|
| 0 | Preparação e proteção da base | Baseline confiável, riscos mapeados e critérios definidos | Obrigatória |
| 1 | **Reformulação do cardápio público** | Vitrine profissional, mobile-first e experiência de compra clara | **Máxima** |
| 2 | Catálogo rico: descrições, variantes e adicionais | Produtos mais completos e personalizáveis | Alta |
| 3 | Fichas técnicas e estoque por ingrediente | Consumo de insumos calculado pelas vendas | Muito alta |
| 4 | Integração transacional do pedido e estoque | Pedido, adicionais, receita, pagamento e movimentos consistentes | Crítica |
| 5 | Cozinha/KDS avançada | Produção organizada por item e acompanhamento de preparo | Alta |
| 6 | Caixa e fechamento operacional | Abertura, movimentações, conferência e fechamento auditável | Alta |
| 7 | CRM e relatórios gerenciais | Indicadores mais úteis e histórico confiável | Média/alta |
| 8 | Estabilização e entrega | Testes, segurança, acessibilidade, performance e publicação validados | Obrigatória |

As etapas podem ter subtarefas internas, mas não vou pular a validação de uma etapa para acumular funcionalidades frágeis na seguinte.

---

# 4. Execução detalhada

## Etapa 0 — Preparação, baseline e proteção

### O que vou fazer
- Conferir a branch, o último commit e o estado dos workflows antes de cada conjunto de alterações.
- Mapear os fluxos atuais do cardápio: carregamento do menu, seleção de produto, carrinho, checkout, tracking, promoções, fidelidade e QR.
- Mapear os contratos das Edge Functions `pedidos`, `gerenciar-dados`, `estoque` e dos helpers de autenticação/permissão.
- Confirmar quais partes de `artifacts/api-server` são legado e quais são efetivamente executadas; não manter duas fontes de verdade.
- Registrar os pontos de regressão que precisam ser testados.

### Critério de saída
- Baseline da branch identificado.
- Fluxos existentes documentados.
- Nenhuma alteração de produção feita apenas durante a auditoria.
- Plano de rollback por commit disponível para alterações sensíveis.

## Etapa 1 — Reformulação completa do cardápio público

**Esta é a primeira grande entrega de produto.** A meta não é apenas deixar o menu bonito: é tornar fácil descobrir produtos, entender o que está sendo comprado, adicionar ao carrinho e concluir o pedido pelo celular.

Arquivos de partida:
- `artifacts/cantinas-nexus/src/pages/Home.tsx`
- `artifacts/cantinas-nexus/src/lib/menu-templates.ts`
- `artifacts/cantinas-nexus/src/lib/api.ts`
- `artifacts/cantinas-nexus/src/index.css`
- `supabase/functions/pedidos/index.ts` (somente quando um contrato de dados precisar ser ajustado)

### 1.1 Identidade visual e seis modelos

Manter a escolha do estabelecimento entre os seis modelos já cadastrados:
- Modern Dark
- Minimal
- Editorial
- Vibrant
- Luxury
- Compact

Mas os modelos precisam ter personalidade real. Não serão seis cópias com cores diferentes. Cada um terá composição, hierarquia, densidade, tipografia, tratamento de imagem e estilo de componentes coerentes com sua proposta.

As configurações do estabelecimento — nome, logo, cor principal e fundo — devem ser aplicadas de forma consistente. A cor escolhida pelo dono não pode tornar texto, preço, botão ou status ilegível.

### 1.2 Estrutura da página pública

Revisar e redesenhar:
- Cabeçalho com marca do estabelecimento e informações essenciais.
- Hero enxuto e útil, sem banners genéricos que ocupem espaço sem ajudar o pedido.
- Navegação de categorias fácil de usar no celular.
- Busca e filtros, quando fizerem sentido para o tamanho do catálogo.
- Seção de produtos com hierarquia visual clara.
- Destaques e promoções somente quando houver dados reais.
- Carrinho sempre fácil de encontrar, com total visível e indicação de quantidade.
- Checkout com etapas e mensagens inequívocas.
- Acompanhamento do pedido com status compreensível.
- Estados de carregamento, vazio, erro, produto indisponível e estabelecimento fechado, quando aplicável.

### 1.3 Fotos reais e apresentação dos produtos

- Usar a imagem enviada pelo próprio estabelecimento quando existir.
- Remover o mapeamento de imagens genéricas por palavras do nome do produto.
- Quando não houver fotografia, usar placeholder visual neutro e coerente, nunca fingir que uma foto representa aquele produto.
- Manter proporção, enquadramento e tamanho consistentes.
- Não inventar descrição, ingredientes, alergênicos ou características que não estejam cadastrados.

### 1.4 Cards, detalhes e compra

- Nome e preço fáceis de localizar.
- Categoria e disponibilidade apresentadas sem ruído visual.
- Área de toque adequada para celular.
- Ação de adicionar ao carrinho inequívoca.
- Favoritar, quando disponível, sem controles interativos aninhados.
- Detalhes de produto organizados e preparados para receber descrições e adicionais na etapa seguinte.
- Feedback imediato ao adicionar, alterar quantidade ou remover item.

### 1.5 Carrinho, checkout e tracking

A reformulação visual não pode quebrar:
- Persistência do carrinho já existente.
- Quantidades e totais.
- Aplicação de promoções calculadas no backend.
- Validação de disponibilidade e estoque no servidor.
- Método de pagamento aceito pelo Nexus.
- Envio de observações e telefone, respeitando validações existentes.
- Criação atômica e idempotente do pedido.
- Token de acompanhamento e tela de tracking.

### 1.6 Validação obrigatória do cardápio

Testar pelo menos:
- Celular estreito, celular grande, tablet e desktop.
- Os seis modelos.
- Estabelecimento com e sem logo.
- Produtos com e sem imagem real.
- Catálogo vazio, uma categoria e várias categorias.
- Produto indisponível/esgotado.
- Promoção ativa e sem promoção.
- Carrinho vazio, com um produto e com vários produtos.
- Atualização de quantidade, remoção e retorno ao menu.
- Checkout bem-sucedido e erro de validação.
- Tracking de pedido.
- Contraste, foco por teclado, rótulos acessíveis e áreas de toque.

### Critério de conclusão
Um cliente deve conseguir abrir o cardápio no celular, entender a oferta, escolher produtos, revisar o carrinho e concluir um pedido sem depender de explicação do funcionário. Os seis modelos devem estar visualmente coerentes e os fluxos existentes preservados.

---

## Etapa 2 — Catálogo rico: descrição, variantes e adicionais

A experiência visual da etapa 1 será construída inicialmente com os dados existentes. Nesta etapa, o catálogo ganhará dados estruturados que hoje não estão disponíveis de forma completa no tipo `ApiProduct`.

### Funcionalidades
- Descrição curta e, quando necessário, descrição detalhada.
- Variantes de produto (ex.: tamanho, porção ou opção de embalagem).
- Grupos de adicionais e complementos.
- Regras de seleção: mínimo, máximo e obrigatoriedade.
- Acréscimo de preço por opção.
- Ordem de exibição e disponibilidade de cada opção.
- Observações do cliente separadas das opções estruturadas.
- Snapshot dos nomes e preços escolhidos dentro do pedido, preservando o histórico mesmo que o catálogo mude depois.

### Trabalho técnico
- Modelar as entidades no PostgreSQL com vínculo explícito ao estabelecimento.
- Criar migration nova e índices/constraints necessários.
- Definir políticas RLS e permissões para leitura pública controlada e escrita administrativa.
- Atualizar Edge Functions, validação de payload, tipos e camada de dados do frontend.
- Atualizar editor de produtos no painel e o menu público.
- Validar o preço final novamente no servidor; o cliente nunca envia um total confiável.

### Critério de conclusão
O cliente escolhe variantes e adicionais no cardápio, visualiza o preço calculado, envia o pedido e a equipe recebe exatamente as opções selecionadas, com preço histórico correto.

## Etapa 3 — Fichas técnicas e estoque por ingrediente

O estoque atual trabalha com saldo por produto. Isso é diferente de controlar ingredientes consumidos em uma receita. Esta etapa cria a base para saber o que é consumido quando cada item é vendido.

### Funcionalidades
- Cadastro de insumos/ingredientes.
- Unidade de medida e conversões permitidas.
- Ficha técnica por produto ou variante.
- Componentes e quantidades por receita.
- Rendimento da receita e porção utilizada.
- Custo estimado por receita/produto quando houver dados suficientes.
- Entrada, ajuste, perda/desperdício e inventário.
- Histórico de movimentos com motivo, origem, responsável e referência.
- Alertas de estoque mínimo.

### Trabalho técnico
- Definir antes da migration como serão unidades, conversões, precisão decimal, arredondamento e rendimento.
- Criar schema com isolamento por estabelecimento.
- Criar serviços/Edge Functions para movimentos e consultas.
- Impedir saldo negativo indevido e duplicação de baixa.
- Preparar integração com variantes e adicionais.

### Critério de conclusão
O gestor consegue cadastrar uma receita e consultar o impacto de uma venda no saldo de cada ingrediente. Toda alteração de estoque deixa histórico rastreável.

## Etapa 4 — Checkout e estoque transacionais

Esta etapa conecta catálogo, adicionais, ficha técnica, pedido e movimentação de estoque sem deixar operações pela metade.

### O que vou reforçar
- Manter a RPC `checkout_order_atomic` como referência para atomicidade, evoluindo-a com migration e compatibilidade.
- Validar estabelecimento, produto, variante, adicional, preço, promoção e disponibilidade no servidor.
- Calcular consumo de ingredientes a partir da receita e opções selecionadas.
- Registrar todos os movimentos vinculados ao pedido.
- Preservar chave de idempotência para evitar pedido/baixa duplicados em reenvios.
- Definir comportamento para estoque insuficiente e concorrência entre pedidos.
- Definir claramente quando o estoque é reservado, consumido ou restaurado em cancelamentos.
- Vincular status financeiro e status operacional sem tratar pagamento pendente como dinheiro recebido.

### Critério de conclusão
Pedido, itens, preços e baixa de estoque são confirmados juntos ou falham juntos. Reenvio não duplica venda nem consumo. Cancelamento aplica a regra de reversão prevista e auditável.

## Etapa 5 — Cozinha/KDS avançada

### Funcionalidades a avaliar e implementar
- Estados por item, e não somente um status geral para todo o pedido, quando necessário.
- Colunas e filtros por etapa de produção.
- Tempo decorrido desde a entrada e indicação de atraso.
- Observações do cliente e adicionais visíveis para a cozinha.
- Prioridade e ordenação que ajudem a equipe no horário de pico.
- Atualização em tempo real, com reconexão e recuperação de estado.
- Sinalização clara de novo pedido, em preparo, pronto e retirado.
- Histórico de mudanças e responsável pela ação.

### Cuidados
- Preservar compatibilidade com a tela de tracking e com o caixa.
- Não permitir transições inválidas.
- Não duplicar alertas quando a conexão oscilar.

### Critério de conclusão
A equipe entende o que precisa preparar, em que ordem e em qual estado está cada item; o cliente e o caixa recebem estados coerentes.

## Etapa 6 — Caixa, sessões e fechamento

Hoje existem pedidos, transações e relatórios, mas isso não substitui uma sessão de caixa com abertura e fechamento.

### Funcionalidades
- Abertura de caixa com valor inicial e responsável.
- Sessão de caixa vinculada ao estabelecimento e operador.
- Entradas e saídas manuais justificadas.
- Sangria e suprimento.
- Associação de pagamentos à sessão correta.
- Resumo por método de pagamento.
- Valor esperado, valor contado e diferença.
- Fechamento com responsável, horário e observações.
- Histórico imutável/auditável de sessões e movimentos.

### Critério de conclusão
O operador consegue abrir e fechar seu caixa e explicar qualquer diferença a partir do histórico. O sistema distingue pedido, transação, recebimento e movimento de caixa.

## Etapa 7 — CRM e relatórios gerenciais

### Melhorias previstas
- Histórico consistente de pedidos por cliente.
- Produtos mais vendidos por intervalo.
- Ticket médio e evolução por período.
- Desempenho de categorias e promoções.
- Clientes recorrentes e frequência, respeitando as permissões e privacidade.
- Custo estimado, desperdício e margem somente quando os dados de receita/custo forem confiáveis.
- Filtros por período e estabelecimento.
- Exportação com totais conciliáveis com os registros de origem.

### Critério de conclusão
Indicadores são reproduzíveis a partir dos dados operacionais e não misturam estabelecimentos, pedidos cancelados ou pagamentos pendentes como vendas recebidas.

## Etapa 8 — Estabilização e entrega

### Checklist final
- Typecheck e build de produção aprovados.
- Testes dos fluxos críticos aprovados.
- Testes de isolamento entre estabelecimentos e permissões.
- Testes de checkout concorrente e idempotência.
- Testes de cancelamento, estorno e reversão de estoque.
- Responsividade e acessibilidade verificadas.
- Erros de console/rede relevantes tratados.
- Migrations aplicadas no ambiente correto e compatibilidade verificada.
- Workflows do GitHub Actions concluídos com sucesso no commit de entrega.
- Publicação confirmada e smoke test no site publicado.
- Documento de alterações e limitações atualizado.

### Critério de conclusão
Só considerar entregue quando os testes e o comportamento real forem confirmados. Se algo não puder ser testado por falta de ambiente, credencial ou dispositivo, isso será informado claramente como pendência.

---

## 5. Como cada etapa será trabalhada

Para cada etapa, vou seguir sempre este ciclo:

1. **Inspecionar:** ler os arquivos atuais, dependências e contratos afetados.
2. **Planejar a alteração:** listar arquivos, tabelas, funções e riscos antes de escrever.
3. **Implementar:** fazer mudanças coesas, sem misturar refatorações não relacionadas.
4. **Verificar:** rodar ou acompanhar typecheck, build e testes relevantes.
5. **Revisar:** conferir diff, segurança multi-tenant, compatibilidade e experiência visual.
6. **Publicar:** confirmar workflow e commit correto, sem presumir sucesso.
7. **Registrar:** atualizar este plano com status, commit, testes e pendências.

## 6. Regras para uso das referências open source

- **FloCafe (MIT):** referência principal para estoque, receita, cozinha, caixa e testes. Qualquer trecho incorporado exige preservar licença/avisos e verificar licenças das dependências.
- **ElitaleRestro (AGPL-3.0):** referência de modelagem e separação por camadas. Não copiar código sem avaliação específica das implicações de licenciamento.
- **QRMenu:** apenas referência conceitual enquanto não existir uma licença open source explícita.
- A arquitetura e as regras do Nexus permanecem próprias. Não importar Next.js/Prisma/Electron ou substituir Supabase por causa de um projeto de referência.

## 7. Controle de progresso

O status inicial deste plano é:

| Etapa | Status | Observação |
|---|---|---|
| 0. Preparação e baseline | Concluída | Auditoria comparativa criada; branch, arquivos centrais e baseline conferidos |
| 1. Cardápio público | Em andamento | Primeira rodada aplicada: imagens genéricas removidas, cards acessíveis e seis temas refinados; aguardando validação de build e revisão visual completa |
| 2. Catálogo rico | Pendente | Depende da definição de campos e opções |
| 3. Fichas técnicas/ingredientes | Pendente | Depende de decisão de unidades e conversões |
| 4. Checkout transacional | Pendente | Integra receitas, opções e idempotência |
| 5. Cozinha/KDS | Pendente | Evolui sem quebrar status atuais |
| 6. Caixa/fechamento | Pendente | Sessões e movimentos auditáveis |
| 7. CRM/relatórios | Pendente | Indicadores sobre dados confiáveis |
| 8. Estabilização | Pendente | Validação final e publicação |

**Próxima execução:** concluir a preparação mínima e iniciar a Etapa 1 — reformulação do cardápio público. O trabalho do cardápio não será adiado até o fim do ERP.

## 8. Registro da execução — 03/11/2026

### Primeira rodada da Etapa 1
Alterações aplicadas diretamente na branch `main`:
- `artifacts/cantinas-nexus/src/pages/Home.tsx`: removido o mapeamento de imagens genéricas por palavras do nome; produtos sem foto agora recebem placeholder neutro; destaque de combo não inventa fotografia; logo ausente usa inicial do estabelecimento; card de produto deixou de ser um botão gigante com controles aninhados; favoritar e adicionar agora têm botões próprios e acessíveis; paleta clara passou a declarar tokens de superfície/texto.
- `artifacts/cantinas-nexus/src/lib/menu-templates.ts`: estilos dos seis modelos foram diferenciados e organizados para o novo card sem alterar os IDs nem a forma de seleção dos modelos.
- Commit da página: `ca39d2f57ec8c07237c1a29584732275d1307c6f`.
- Commit dos modelos: `9bb6294acfbe25dad3316501aab29b8193573365`.

### Segunda e terceira rodadas da Etapa 1 — 03/11/2026

Alterações adicionais aplicadas diretamente na branch `main`:
- Busca de produtos por nome e categoria, com contador de resultados, limpeza rápida e estado vazio contextual.
- Grade mobile em duas colunas, com cards mais compactos, imagens quadradas no celular e proporção maior em telas amplas.
- Estados de carregamento substituídos por skeletons responsivos, evitando spinner isolado sem contexto.
- Imagens de produto passaram a usar carregamento lazy, decodificação assíncrona e texto alternativo com o nome do produto.
- Limite de adição no carrinho respeita a quantidade de estoque retornada ao menu; o botão de incremento também é desabilitado quando a quantidade no carrinho alcança o estoque disponível.
- Destaque de combo e opções de pagamento passaram a respeitar as cores/superfícies do tema.
- Estados vazios do carrinho e aviso de pagamento pendente receberam tratamento visual coerente com o tema escuro.
- Commits: `7ec0a5aad2c59d625bdcbcf8b75d2ea3b80dc274`, `a94c3a055c4cfe61ea38bdae8f44778d7f1b4214`, `76115abf7ab803855fd954dceaa6753fa3580f65`, `371a05263bd319adec46e18db53d7676be3f7fb3`, `e7b937ddae2c37ce1e2c23864ada542ce6c28aba`, `0ac7efba9849c60ad7de3b6d5d9b04a610c5e308`.

### Verificações realizadas
- Confirmação via GitHub API de sucesso do workflow do commit `371a052`.
- Workflows dos commits `e7b937d` e `0ac7efb` foram disparados; estavam em andamento/na fila na última consulta.
- Conferências estáticas confirmaram busca, limpeza, skeletons, lazy loading, guardas de estoque e tokens de tema no código.
- Ainda não houve teste de interação visual real em dispositivo/browser nesta rodada. A Etapa 1 continua em andamento e não deve ser marcada como concluída.

### Limitações ainda abertas nesta rodada
- A etapa não está concluída: falta confirmar o workflow no commit mais recente, revisar o restante do fluxo visual (hero, categorias, carrinho, pagamento e tracking) e testar a experiência publicada.
- Descrições de produto, variantes e adicionais dependem da Etapa 2 e de mudanças coordenadas no backend. Não serão inventados no frontend.
- Não foi feita alteração de banco de dados nesta rodada.
