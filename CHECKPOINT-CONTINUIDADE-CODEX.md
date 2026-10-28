# Checkpoint de continuidade — Nexus ERP/CRM

**Atualizado em:** 28/10/2026  
**Repositório:** `VNSANTS/Nexus-ERP-CRM`  
**Branch:** `main`

Este arquivo registra o estado do trabalho para retomar em outra sessão do Codex. O projeto está em `artifacts/cantinas-nexus`; o backend usa Supabase.

## Estado atual

- A exclusão de solicitações/estabelecimentos pelo painel raiz foi implementada anteriormente. O usuário confirmou que excluir uma solicitação funcionou.
- Foi implementado o fluxo de recuperação de senha e primeiro acesso do dono do estabelecimento: definir senha e continuar o onboarding existente.
- O primeiro link de recuperação abriu uma página não encontrada. Causa identificada: o GitHub Pages responde HTTP 404 para URLs de rotas internas, como `/estabelecimento/onboarding`.
- Corrigimos o fluxo para o Supabase retornar à raiz do site, que responde HTTP 200. O app reconhece a sessão de recuperação e encaminha para `/estabelecimento/onboarding`.
- A correção está commitada e publicada: `b429070 fix: route password recovery through GitHub Pages root`.
- Build executado com sucesso: `pnpm.cmd --filter @workspace/cantinas-nexus run build`. Permaneceu um aviso do Vite de bundle JS acima de 500 kB; não impediu a publicação.
- GitHub Actions publicou o commit `b429070` com sucesso (workflow run `40566629282`).

## Ação pendente: novo e-mail de senha

- O e-mail enviado antes da correção pode ter sido consumido e aponta para o endereço antigo. Links de recuperação do Supabase são de uso único.
- Tentamos emitir outro link depois da publicação; o Supabase recusou com HTTP 429 (`over_email_send_rate_limit`). O serviço de e-mail padrão permite dois e-mails por hora no projeto.
- Os pedidos anteriores conhecidos foram às 18:38 e 18:57 de 27/10/2026 (horário de Brasília). A estimativa para nova vaga era após 19:38, sujeita a outros e-mails enviados pelo projeto.
- Quando retomar, solicitar um único novo link para `vinigodoaldo@gmail.com`, com `redirect_to=https://vnsants.github.io/Nexus-ERP-CRM/`. Preferir pedir pela tela **Estabelecimento → Definir ou recuperar senha**, que já usa esse destino. Se o usuário pedir envio por comando, usar o endpoint Supabase Auth `/auth/v1/recover` com a chave publishable; nunca expor chave secreta/service role.
- Depois do novo envio, orientar a conferir caixa de entrada e spam, abrir o link mais recente uma vez, definir uma senha com pelo menos 8 caracteres e seguir as etapas de onboarding.

## Commits recentes

- `b429070` — usa a raiz do GitHub Pages como destino de recuperação e encaminha a sessão de recuperação ao onboarding.
- `a84f257` — adiciona a tela para definir senha e concluir o fluxo de recuperação do estabelecimento.
- `35d992a` — adiciona exclusão de estabelecimentos aprovados no painel raiz.

## Estado do Git ao salvar este checkpoint

- `main` estava sincronizada com `origin/main`.
- Havia uma alteração local preexistente em `supabase/.temp/cli-latest`. Não foi incluída nos commits; verificar antes de limpar ou commitar.

## Requisitos e visão informados pelo Vinícius

O escopo final desejado inclui separar cardápio do estabelecimento e cozinha; login do estabelecimento por código de acesso; contas de clientes por e-mail/senha e Google; pedidos para retirada ou entrega, endereço e pagamento; acompanhamento do pedido em dispositivos diferentes e por QR Code; nome para chamada e histórico de compras; gestão administrativa ampla; cadastro de funcionários e um perfil de entregador com veículo e documentos (com exceção de documentos para bicicleta).

Esses itens descrevem a visão futura, não confirmação de que já estão implementados. Antes de iniciar uma dessas frentes, inspecionar o código e o documento do projeto para determinar o estado real.

## Ao retomar

1. Ler este checkpoint e [CANTINAS-NEXUS-PROJETO.md](CANTINAS-NEXUS-PROJETO.md).
2. Conferir `git status -sb` e preservar qualquer alteração local, principalmente `supabase/.temp/cli-latest`.
3. Resolver o novo link de recuperação pendente; não reenviar repetidamente se o Supabase responder 429.
4. Depois de o usuário definir a senha, confirmar se o onboarding avança e se o acesso do dono funciona.
5. Para mudanças em Supabase, consultar a skill Supabase do ambiente e verificar se há alteração de Edge Function ou banco que exija deploy/migration.

## Estrutura útil

- Frontend: `artifacts/cantinas-nexus/src`
- Rotas: `artifacts/cantinas-nexus/src/App.tsx`
- Sessão do dono: `artifacts/cantinas-nexus/src/lib/owner-auth.tsx`
- Login do estabelecimento: `artifacts/cantinas-nexus/src/pages/LoginEstabelecimento.tsx`
- Onboarding/definição de senha: `artifacts/cantinas-nexus/src/pages/OnboardingEstabelecimento.tsx`
- Publicação GitHub Pages: `.github/workflows/deploy.yml`
- Funções Supabase: `supabase/functions`
## Atualização em 28/10/2026

- Foi solicitado um novo e-mail de recuperação para `vinigodoaldo@gmail.com`, com retorno para a raiz publicada do site. O Supabase aceitou a solicitação (HTTP 200). Ainda falta o usuário abrir o link e concluir senha/onboarding.
- Revisando as Edge Functions, encontramos uma falha de autorização: `requireEmployee` confiava em `user_metadata.role`, que o próprio usuário consegue editar. Agora a identidade é validada no Supabase Auth e cargo/nome/status ativo vêm de `employees`; contas antigas têm fallback para `employees.id`.
- A mudança está publicada nas funções `clientes`, `estoque`, `gerenciar-dados`, `gerenciar-funcionarios`, `fornecedores`, `pedidos` e `promocoes`. Todas estão ativas; as versões confirmadas foram respectivamente 11, 11, 13, 12, 11, 11 e 11.
- O código compartilhado da correção e este checkpoint precisam ser commitados e enviados ao GitHub; não foi feita alteração no banco.

### Revisao complementar de autorizacao em 28/10

- As APIs de pedidos, estoque, clientes, fornecedores, promocoes e configuracoes legadas trabalham com dados globais e nao filtram por estabelecimento. O helper agora nega funcionarios com `establishment_id` preenchido, ate a arquitetura dessas APIs ser isolada por tenant.
- Segundo deploy concluido nas mesmas sete funcoes. Versoes atuais confirmadas no Supabase: `clientes v12, estoque v12, gerenciar-dados v14, gerenciar-funcionarios v13, fornecedores v12, pedidos v12, promocoes v12`.
