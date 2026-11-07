# Nexus ERP/CRM — migração para Cloudflare (staging)

## Status em 2026-11-07

- Branch isolada: `deploy/cloudflare-workers`. O site atual na `main` e o GitHub Pages não foram alterados.
- Conta Cloudflare confirmada, sem projetos Workers/Pages anteriores.
- Projeto Cloudflare Pages **`nexus-erp-crm-staging` criado**, com GitHub conectado ao repositório e branch `deploy/cloudflare-workers`. A primeira tentativa de criar havia falhado com `8000011`, mas foi resolvida após a autorização do GitHub pelo proprietário.
- Variáveis de build públicas configuradas: `NODE_VERSION=22`, `BASE_PATH=/`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave `publishable`, sem credencial de serviço). O staging usa a API do Supabase principal; testes mutáveis exigem dados sintéticos e planejamento.
- Endereço do staging: https://nexus-erp-crm-staging.pages.dev/ — publicação e comportamento dependem de confirmação por deploy e testes.
- O Cloudflare Pages é o primeiro destino por integrar builds Vite de um repositório GitHub privado; Workers Static Assets continua uma alternativa futura.
- Migração do Supabase `20261106184508_atomic_order_transitions_and_inventory.sql` pendente em produção. **Não migrar a base sem backup privado restaurado/testado**.
- Pagamentos devem continuar presenciais, com seleção do método no cardápio e confirmação manual pelo caixa. Nenhum gateway bancário.

## Configuração para conectar Git (sem credenciais privilegiadas)

1. Na conta Cloudflare, abrir **Workers & Pages > Create application > Pages > Connect to Git**.
2. Autorizar o aplicativo oficial **Cloudflare Workers and Pages** no GitHub, concedendo acesso ao repositório `VNSANTS/Nexus-ERP-CRM`. A conexão do ChatGPT com GitHub é independente dessa instalação.
3. Projeto **`nexus-erp-crm-staging`** já criado e conectado à branch **`deploy/cloudflare-workers`**; manter o acesso restrito a essa branch enquanto o backend não está homologado em produção.
4. Root directory: raiz do repositório. Build command:
   ```sh
   npm install -g pnpm@11 && pnpm install --frozen-lockfile && pnpm --filter @workspace/cantinas-nexus run build
   ```
5. Build output directory: `artifacts/cantinas-nexus/dist/public`.
6. Build environment variables (produção do **projeto de staging**, não da loja real):
   - `NODE_VERSION=22`
   - `BASE_PATH=/`
   - `VITE_SUPABASE_URL`: URL pública do projeto Supabase.
   - `VITE_SUPABASE_ANON_KEY`: chave **publishable** (`sb_publishable_...`), jamais a `service_role` ou `sb_secret`.
   - `VITE_TURNSTILE_SITE_KEY`: somente se o CAPTCHA estiver habilitado e o hostname de staging autorizado.
7. Manter preview deployments desabilitados até validar segurança e ambiente. Não expor segredos a builds de PR.
8. Configurar no Supabase Auth as URLs de retorno exatas do novo hostname HTTPS, caso haja login/callback. Verificar regras de CORS das Edge Functions.
9. Testar diretamente no hostname Cloudflare: `/`, `/cozinha`, `/acompanhar/:token`, login, cardápio, pedido, caixa e confirmação de pagamento. Usar dados sintéticos; não efetuar pedidos de produção sem plano.
10. Antes de substituir a hospedagem real: backup restaurado e verificado, migração pendente e Edge Functions implantadas, testes de regressão aprovados, privacidade e logs validados.

## Roteamento e segurança

- O arquivo `public/404.html` era um redirecionador específico do GitHub Pages e foi retirado **somente nesta branch**. O Cloudflare Pages resolve rotas de SPA servindo `index.html` se não houver `404.html` na raiz.
- `public/_headers` adiciona cabeçalhos defensivos e `X-Robots-Tag: noindex, nofollow` no staging. Remover `noindex` na publicação definitiva.
- O frontend usa `BASE_PATH=/` no Cloudflare; o build legado do GitHub Pages usa `/Nexus-ERP-CRM/`. Não misturar os dois.
- Tornar o repositório privado **somente depois** de confirmar o build Cloudflare e a independência do GitHub Pages. Código JavaScript enviado ao navegador continua inspecionável mesmo com o repositório privado; a segurança depende de autenticação, RLS, autorização, chaves privadas no servidor e controles de acesso.

## Cutover (não executar antes dos gates)

1. Preparar backup e restauração de teste.
2. Atualizar Supabase em janela controlada; verificar funções, Edge, ACLs e operações reais.
3. Aprovar build, redirecionamentos, autenticação e testes no Cloudflare.
4. Desativar publicação GitHub Pages, tornar o repositório privado, publicar hostname definitivo e fazer smoke pós-deploy.
5. Documentar rollback de frontend e do banco; nunca usar `supabase db reset --linked` em produção.

Referências:
- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/
- https://developers.cloudflare.com/workers/ci-cd/builds/
