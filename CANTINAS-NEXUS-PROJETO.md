# Cantinas Nexus

Sistema de autoatendimento para cantina escolar. O projeto possui um totem para criação de pedidos, uma tela de acompanhamento por código/QR Code e um painel interno para cozinha, estoque, clientes, fornecedores, promoções e relatórios.

Este documento descreve o estado atual do projeto incluído no pacote `cantinas-nexus-projeto.zip`.

## 1. Visão geral

### Experiências do sistema

- **Totem (`/`)**
  - Cardápio visual com a identidade StarNexus.
  - Categorias em pills com ícones ilustrados.
  - Produtos com ilustrações, favoritos, preço, promoção e disponibilidade.
  - Carrinho local da sessão do totem.
  - Checkout por PIX, crédito, débito ou dinheiro.
  - Geração de código do pedido e QR Code de acompanhamento.
  - Acesso interno à cozinha protegido por gesto de pressionar a logo.

- **Acompanhamento (`/acompanhar/:codigo`)**
  - Consulta do pedido por código.
  - Atualização periódica do status.
  - Exibição dos itens, total e progresso do pedido.

- **Painel da cozinha (`/cozinha`)**
  - Login de funcionário.
  - Fila de pedidos e avanço de status.
  - Confirmação de retirada.
  - Produtos e disponibilidade.
  - Controle de estoque, entradas, mínimos e desperdícios.
  - Promoções.
  - Cadastro de funcionários.
  - CRM de clientes e interações.
  - Fornecedores e pedidos de compra.
  - Configurações da loja.
  - Relatórios e exportação CSV.

## 2. Stack atual

- Node.js 24
- pnpm workspaces
- TypeScript
- React + Vite
- Tailwind CSS
- Wouter para rotas do frontend
- TanStack React Query para cache e sincronização das consultas
- Framer Motion para animações
- Lucide React para ícones de interface
- QRCode React para QR Codes
- Recharts para gráficos do painel
- Express 5 para a API
- PostgreSQL
- Drizzle ORM
- Zod e pacotes compartilhados do workspace

## 3. Arquitetura

```text
Totem React/Vite
       |
       | chamadas HTTP /api
       v
API Express
       |
       | Drizzle ORM
       v
PostgreSQL
```

O frontend e a API são artefatos separados:

- `artifacts/cantinas-nexus`: aplicação web do totem, acompanhamento e cozinha.
- `artifacts/api-server`: servidor Express com as rotas REST.
- `lib/db`: conexão PostgreSQL, schema Drizzle e configuração do banco.
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`: pacotes compartilhados do workspace.

O carrinho é mantido em `localStorage` porque representa a sessão do totem. Produtos, pedidos, estoque, funcionários, clientes, promoções e relatórios são persistidos no PostgreSQL.

## 4. Estrutura principal

```text
.
├── artifacts/
│   ├── api-server/
│   │   └── src/
│   │       ├── app.ts
│   │       ├── index.ts
│   │       └── routes/
│   ├── cantinas-nexus/
│   │   ├── public/
│   │   │   └── reference/       # logo, saudação, ícones e ilustrações
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Home.tsx
│   │       │   ├── Tracking.tsx
│   │       │   └── Kitchen.tsx
│   │       ├── lib/
│   │       │   ├── api.ts
│   │       │   ├── cart-store.ts
│   │       │   └── csv.ts
│   │       └── index.css
│   └── mockup-sandbox/
├── lib/
│   ├── db/
│   │   ├── src/index.ts
│   │   └── src/schema/index.ts
│   ├── api-spec/
│   ├── api-zod/
│   └── api-client-react/
├── attached_assets/              # referências enviadas para o projeto
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── replit.md
```

## 5. Como instalar

Requisitos:

- Node.js 24 ou compatível.
- pnpm.
- PostgreSQL provisionado.
- Variável `DATABASE_URL` configurada no ambiente.

Na raiz do projeto:

```bash
pnpm install
pnpm --filter @workspace/db run push
```

O comando de banco aplica o schema Drizzle ao PostgreSQL configurado. O projeto utiliza o banco PostgreSQL do ambiente e não cria um banco SQLite separado.

## 6. Como executar

### Frontend

```bash
pnpm --filter @workspace/cantinas-nexus run dev
```

O frontend usa a porta definida pelo artifact, atualmente `19986`, e a variável `BASE_PATH`.

### API

```bash
pnpm --filter @workspace/api-server run dev
```

A API escuta na porta `8080` no workflow configurado e recebe as chamadas pelo caminho `/api`.

### Typecheck completo

```bash
pnpm run typecheck
```

### Build completo

```bash
pnpm run build
```

### Build somente do frontend

```bash
PORT=19986 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/cantinas-nexus run build
```

## 7. Variáveis de ambiente

### Obrigatória

- `DATABASE_URL`: string de conexão do PostgreSQL.

### Usadas pelo artifact web

- `PORT`: porta do Vite/servidor de desenvolvimento.
- `BASE_PATH`: base da aplicação quando servida por uma rota do artifact.

Não coloque senhas, tokens ou chaves no código ou neste documento. Use os Secrets/Environment Variables do Replit.

O arquivo `.env.example` na raiz lista os nomes das variáveis para configurar em outro ambiente. Ele contém apenas placeholders e não deve ser preenchido com valores reais antes de ser enviado para um repositório público.

### Como continuar em outro ambiente

1. Copie o projeto e instale as dependências com `pnpm install`.
2. Provisione um PostgreSQL novo ou conecte o PostgreSQL de destino.
3. Configure `DATABASE_URL` usando o gerenciador de secrets do novo ambiente.
4. Gere e configure um novo `SESSION_SECRET` no gerenciador de secrets. Nunca reutilize ou publique o valor em um arquivo.
5. Configure `PORT`, `NODE_ENV`, `LOG_LEVEL` e `BASE_PATH` como variáveis comuns.
6. Execute `pnpm --filter @workspace/db run push`.
7. Inicie os workflows da API e do frontend.

O ZIP não contém os valores dos Secrets nem os dados do banco atual. Isso é intencional: o banco e os segredos precisam ser migrados por um canal seguro e configurados no ambiente de destino.

## 8. Modelo de dados

O schema está em `lib/db/src/schema/index.ts` e contém:

- `products`: produtos, preço, categoria, emoji legado, sazonalidade e disponibilidade.
- `orders`: pedidos, status, código, forma de pagamento, total e dados do cliente.
- `order_items`: itens e valores unitários do pedido.
- `stock`: quantidade atual e estoque mínimo por produto.
- `stock_history`: histórico de entradas e ajustes.
- `waste_log`: desperdícios.
- `employees`: funcionários, funções e credenciais protegidas.
- `promotions`: promoções e produtos relacionados.
- `transactions`: transações financeiras associadas às vendas.
- `customers`: cadastro de clientes.
- `customer_interactions`: histórico de interações do CRM.
- `suppliers`: fornecedores.
- `supply_requests`: pedidos de compra.
- `loyalty`: pontuação e histórico da fidelidade.
- `settings`: configurações da loja.
- `daily_counter`: contador diário dos códigos dos pedidos.

## 9. API REST

Todas as rotas são montadas sob `/api`.

### Saúde

- `GET /api/healthz`

### Produtos

- `GET /api/products`
- `POST /api/products`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`

### Pedidos

- `GET /api/orders`
- `GET /api/orders/:id`
- `GET /api/orders/by-code/:code`
- `POST /api/orders/checkout`
- `POST /api/orders/manual`
- `PATCH /api/orders/:id/status`
- `PATCH /api/orders/:id/observacoes`
- `POST /api/orders/confirm-pickup`
- `POST /api/orders/:id/advance`

### Estoque

- `GET /api/stock`
- `GET /api/stock/history`
- `GET /api/stock/waste`
- `POST /api/stock/:productId/entry`
- `PATCH /api/stock/:productId/minimo`
- `POST /api/stock/:productId/waste`

### Funcionários

- `GET /api/employees`
- `POST /api/employees/login`
- `POST /api/employees`
- `PATCH /api/employees/:id`
- `DELETE /api/employees/:id`

As respostas públicas não retornam o campo `password`. Senhas novas são armazenadas com hash `scrypt`. Senhas antigas em formato legado são migradas automaticamente no primeiro login bem-sucedido.

### Promoções

- `GET /api/promotions`
- `POST /api/promotions`
- `PATCH /api/promotions/:id`
- `DELETE /api/promotions/:id`

### Clientes e CRM

- `GET /api/customers`
- `GET /api/customers/:telefone`
- `PUT /api/customers/:telefone`
- `DELETE /api/customers/:telefone`
- `GET /api/customers/interactions`
- `POST /api/customers/:telefone/interactions`
- `GET /api/customers/loyalty`

### Fornecedores

- `GET /api/suppliers`
- `POST /api/suppliers`
- `PATCH /api/suppliers/:id`
- `DELETE /api/suppliers/:id`
- `GET /api/suppliers/requests`
- `POST /api/suppliers/requests`
- `PATCH /api/suppliers/requests/:id`
- `DELETE /api/suppliers/requests/:id`

### Configurações

- `GET /api/settings`
- `PATCH /api/settings`

### Relatórios

- `GET /api/reports/daily`
- `GET /api/reports/products`
- `GET /api/reports/hourly`
- `GET /api/reports/transactions`
- `GET /api/reports/waste`
- `GET /api/reports/loyalty`
- `POST /api/reports/clear-sales`

## 10. Fluxo de um pedido

1. O aluno escolhe produtos no totem.
2. O carrinho é mantido localmente durante a sessão.
3. O usuário abre o carrinho e escolhe a forma de pagamento.
4. O frontend envia o checkout para `POST /api/orders/checkout`.
5. A API valida os produtos, calcula o total, cria o pedido, baixa o estoque e registra a transação.
6. O sistema mostra o código do pedido.
7. O QR Code leva para `/acompanhar/:codigo`.
8. A tela de acompanhamento consulta o pedido periodicamente.
9. A cozinha avança os status até o pedido ficar pronto e ser retirado.

## 11. Identidade visual

Os assets visuais da referência estão em:

```text
artifacts/cantinas-nexus/public/reference/
```

Eles incluem:

- Logo StarNexus.
- Saudação “Olá!”.
- Mensagem “O que você vai pedir hoje?”.
- Ícones das categorias.
- Ilustrações de coxinha, pastel, refrigerante, suco, combo, canjica e uva.
- Banner de combos.

As imagens de referência originais enviadas estão em `attached_assets/`.

O visual usa:

- Fundo marfim.
- Navy escuro para textos.
- Laranja StarNexus para ações e preços.
- Cards claros com bordas e sombras suaves.
- Botões grandes para uso em totem/tablet.
- Layout responsivo para desktop e celular.

## 12. Segurança

- O campo `password` nunca é enviado nas respostas da API.
- Novas senhas de funcionários são armazenadas com `scrypt`.
- Senhas antigas são migradas após login válido.
- O frontend não contém credenciais públicas de demonstração.
- Segredos devem ficar no sistema de Secrets/Environment Variables.
- O acesso da cozinha é iniciado pela rota `/cozinha`.

Para produção, recomenda-se adicionar autenticação de sessão/token no backend, autorização por função, rate limiting, validação de payloads em todas as rotas e política de CORS restritiva.

## 13. Workflows do Replit

O projeto possui estes workflows:

- `artifacts/cantinas-nexus: web`
  - Frontend do totem.
- `artifacts/api-server: API Server`
  - API REST.
- `artifacts/mockup-sandbox: Component Preview Server`
  - Servidor de previews de componentes.

As configurações dos artifacts ficam em:

```text
artifacts/cantinas-nexus/.replit-artifact/artifact.toml
artifacts/api-server/.replit-artifact/artifact.toml
artifacts/mockup-sandbox/.replit-artifact/artifact.toml
```

## 14. Verificação realizada

Antes de gerar este pacote, foram executados:

```bash
pnpm --filter @workspace/cantinas-nexus run typecheck
pnpm --filter @workspace/api-server run typecheck
PORT=19986 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/cantinas-nexus run build
```

Também foram conferidos:

- Inicialização do frontend.
- Inicialização da API.
- Checkout retornando sucesso.
- Login válido e inválido.
- Ausência de `password` nas respostas públicas.
- Renderização do totem em desktop e celular.
- Contraste da tela de pagamento/confirmado.

## 15. O que não está incluído neste escopo

O texto de referência enviado também menciona uma integração com WhatsApp via Baileys e SQLite. Essa integração **não faz parte da implementação atual**. O projeto entregue usa PostgreSQL, Express e o frontend React/Vite existentes.

Para adicionar WhatsApp depois, será necessário definir:

- Número/dispositivo responsável pela sessão.
- Processo de QR Code e persistência da sessão.
- Parser de mensagens.
- Regras de segurança e moderação de nomes.
- Rotas e telas específicas.
- Política de operação contínua do processo Baileys.
