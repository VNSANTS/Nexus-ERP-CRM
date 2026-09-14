# Cantinas Nexus

Sistema de autoatendimento para cantina escolar: totem para o aluno pedir, página de acompanhamento do pedido pelo celular, e painel da cozinha para gerenciar pedidos, estoque e relatórios do dia.

## Run & Operate

- `pnpm --filter @workspace/cantinas-nexus run dev` — roda o app (via workflow `artifacts/cantinas-nexus: web`)
- `pnpm run typecheck` — typecheck completo do monorepo
- `pnpm run build` — typecheck + build de todos os pacotes

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind, wouter (rotas), qrcode.react (QR codes), recharts (gráficos)
- Sem backend: todos os dados (produtos, pedidos, estoque, relatórios) ficam em um único registro no `localStorage`, sincronizado entre abas via evento `storage`

## Where things live

- `artifacts/cantinas-nexus/src/lib/store.ts` — fonte da verdade dos dados: tipos, seed de produtos/estoque, ações (carrinho, checkout, status de pedido, estoque, login da cozinha) e funções de relatório (`computeDailySummary`, `computeTopProducts`, `computeHourlyPeaks`)
- `artifacts/cantinas-nexus/src/lib/csv.ts` — exportação de relatórios para CSV/Excel
- Rotas do app: `/` (tela do aluno/tablet), `/acompanhar/:codigo` (acompanhamento no celular), `/cozinha` (login + painel da cozinha: pedidos, estoque, relatórios)

## Architecture decisions

- Persistência 100% client-side (localStorage) por escolha explícita do usuário — não há API nem banco de dados. Sincronização entre abas usa o evento nativo `storage`; dentro da mesma aba, um `useSyncExternalStore` reage a qualquer mutação.
- Código do pedido (`001`, `002`, ...) reinicia diariamente com base na data local do navegador.
- Pedido "atrasado" = status `recebido` ou `preparo` há mais de 10 minutos (`isOrderLate` em `store.ts`).
- Login da cozinha usa credencial fixa (`cozinha` / `cantina123`) guardada no próprio registro local — adequado para uma demonstração escolar, não é autenticação real.

## Product

- Tela do aluno: cardápio em grade, carrinho lateral, checkout com PIX/Cartão/Dinheiro, código do pedido + QR code de acompanhamento.
- Acompanhamento do pedido: status em tempo real (Recebido → Em preparo → Pronto → Retirado).
- Painel da cozinha: fila de pedidos do dia com destaque para atrasados, confirmação de retirada por código, controle de estoque com alerta de mínimo, e relatórios (vendas do dia, ranking de produtos, horários de pico) exportáveis em CSV.

## User preferences

- Paleta obrigatória: laranja escuro `#FF6B00`, branco e verde.
- Botões grandes, pensados para toque em tablet.

## Gotchas

- Como os dados vivem no `localStorage`, "tablet do aluno", "celular do cliente" e "notebook da cozinha" só compartilham pedidos se forem abas/janelas do mesmo navegador (não há sincronização real entre dispositivos físicos diferentes).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
