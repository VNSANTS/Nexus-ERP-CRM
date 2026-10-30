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
## Atualizacao ADM de dispositivos (28/10/2026)

- A tela ADM fazia leitura direta de establishment_devices; como RLS esta ligado e a tabela nao tem politica de leitura publica, a consulta nao podia listar os dispositivos do dono.
- A lista agora chama criar-dispositivo-cardapio com action=list. A Edge Function autentica dono/ADM e filtra a consulta pelo establishment_id da sessao.
- A verificacao de funcionarios ADM nas funcoes de criar e revogar dispositivo agora tambem exige ativo=true.
- Build do frontend passou. O aviso conhecido de bundle maior que 500 kB permanece.
- criar-dispositivo-cardapio e revogar-dispositivo-cardapio foram publicadas com o Supabase CLI. Falta commit/push do codigo desta atualizacao.
## Atualizacao do fluxo do dono (28/10/2026)

- Foi confirmado que establishment_owners tem RLS sem politica de SELECT. O OwnerAuth antigo consultava diretamente essa tabela, portanto nao conseguia carregar o estabelecimento do dono depois do login/recovery.
- Criada e publicada a Edge Function obter-estabelecimento-dono: valida a sessao Auth e retorna apenas o estabelecimento ligado ao usuario.
- OwnerAuth agora usa essa funcao. Typecheck e build passaram; permanece o aviso conhecido de bundle acima de 500 kB.
- Falta commit/push desta correcao para o novo frontend ir ao GitHub Pages. Aguardar o workflow terminar antes de abrir o link de recuperacao de uso unico.

### Validacao final do fluxo do dono (28/10/2026)

- Commit/push concluido: b6f9949.
- GitHub Actions run 40731134619 terminou com sucesso; a raiz publicada respondeu HTTP 200 e carrega o bundle novo.
- Consulta ao banco confirmou que a conta dona vinculada ainda esta com onboarding_completo=false.
- O e-mail enviado hoje continua aguardando o usuario abrir o link e concluir a senha. Nao reenviar outro sem necessidade: cada link e de uso unico e o provedor tem limite horario.

## Atualizacao: cadastro de funcionario (28/10/2026)

- Logs da tentativa em 17:12 UTC mostraram Auth code email_exists: o e-mail informado ja pertence a uma conta. A tentativa nao criou um segundo usuario.
- Como o dono ja e o administrador principal, o onboarding agora informa isso quando o campo recebe o mesmo e-mail e permite continuar sem criar funcionario.
- finalizar-onboarding nao exige mais funcionario; o dono pode concluir usando a conta principal e abrir o ADM.
- criar-funcionario agora traduz corretamente a resposta de e-mail duplicado para HTTP 409; a tela le e mostra a mensagem da Edge Function em vez de um erro 500 generico.
- Typecheck e build passaram. criar-funcionario e finalizar-onboarding foram publicadas. Falta commit/push do frontend e aguardar o deploy do GitHub Pages.

### Reload seguro apos definir senha

- Depois de atualizar a senha, OwnerAuth remove hash e parametros de callback da URL. Assim, atualizar a tela nao inicia novamente o fluxo PASSWORD_RECOVERY.
- Typecheck e build passaram. Falta commit/push desta limpeza de URL.

### Finalizacao da tentativa de funcionario

- Confirmado no log: Auth recusou o email existente (email_exists); nenhum funcionario duplicado foi criado.
- O dono pode pular a criacao e finalizar com a conta principal. Commit 156e866 incluiu essa opcao; as Edge Functions criar-funcionario e finalizar-onboarding foram publicadas.
- Commit b68f179 limpa tokens de recovery depois da definicao de senha. GitHub Pages workflow 40734998738 concluiu build e deploy com sucesso.
- Proximo passo: atualizar/recarregar a pagina, selecionar Continuar sem funcionario e concluir. Se o reload reapresentar Defina sua senha por causa do link ja usado, entrar pelo login de estabelecimento com a senha definida e retornar ao onboarding.

## Estado ao encerrar a sessão — 28/10/2026

### Login unificado

- Vinícius pediu um único login para cliente, funcionário e ADM, sem atalhos separados para cozinha e dono. Os atalhos “Acesso de funcionário ou ADM” e “Já tenho um estabelecimento” foram removidos da tela inicial. O cadastro de estabelecimento continua disponível.
- O login principal tenta identificar primeiro uma conta de funcionário ativa. Aceita o username ou o e-mail cadastrado; o cargo vem do registro em `employees`, nunca de `user_metadata`.
- Se não for funcionário, autentica pelo fluxo normal e encaminha o dono para `/estabelecimento`; cliente segue para `/estabelecimentos`. Cliente ainda pode entrar com e-mail, telefone ou CPF.
- `/cozinha` e `/estabelecimento/login` agora usam o mesmo formulário. Após autenticação de funcionário, o app reabre diretamente o painel correto e mantém o perfil ADM ou funcionário; sair limpa a sessão local.
- A recuperação de senha continua disponível no formulário unificado para quem informar o e-mail.
- Para permitir as funções antigas da cozinha, funcionário vinculado só é autorizado enquanto existe exatamente um estabelecimento e ele é o estabelecimento vinculado. Se houver mais de um, negar é intencional até a migração das APIs para isolamento por estabelecimento.

### Publicação desta alteração

- Commit `52ffd3a feat: unify customer employee and owner login`, enviado para `main`.
- Supabase Edge Function `cozinha-login` implantada.
- Build e `npm.cmd run typecheck` passaram. O build mantém o aviso conhecido de bundle JavaScript acima de 500 kB.
- GitHub Actions workflow `40740890229` concluiu com sucesso para o commit `52ffd3a`.
- Antes disso, o commit `521c184` já havia publicado a navegação ADM/cozinha e exclusão de dispositivos revogados; `b3229f0` habilitou o login de funcionário e as funções compartilhadas.
- `supabase/.temp/cli-latest` continua modificado localmente e foi excluído dos commits. Não limpar nem commitar sem revisar.

### Próximo passo para amanhã

1. Abrir o site publicado, atualizar a tela e testar o mesmo formulário com uma conta cliente, a conta dona do estabelecimento, um funcionário comum e um funcionário ADM.
2. Confirmar os destinos: cliente em `/estabelecimentos`, dono em `/estabelecimento`, funcionário/ADM em `/cozinha`, com abas coerentes com o cargo.
3. Se funcionário não entrar, anotar exatamente se usou username ou e-mail, a mensagem exibida e conferir se `employees.username` coincide com o identificador cadastrado e se `ativo=true`.
4. Verificar que o projeto ainda tem um único estabelecimento; o acesso legado da cozinha bloqueia funcionários vinculados quando houver mais de um, por segurança.
5. As notas anteriores deste checkpoint registram etapas históricas; este bloco é o estado mais recente e substitui pendências antigas de publicação já resolvidas.
## Confirmação do usuário — 29/10/2026

- Vinícius confirmou que o formulário de login unificado está funcionando. Considerar esta etapa validada e seguir para a próxima solicitação do projeto; só reabrir a investigação do login se surgir um novo erro relatado.
- O próximo trabalho não foi especificado ainda.
## Revisao de produto e CRM (29/10/2026)

- CRM reorganizado para trabalho comercial: indicadores, filtros por segmento, busca por nome/telefone/tag, ordenacao, exportacao CSV, atalho de WhatsApp, registro de contato e carregamento progressivo. Telefones com formatos brasileiros diferentes sao agrupados pela identidade normalizada.
- Painel do estabelecimento recebeu navegacao revisada, com um unico acesso para Administracao e Cozinha, mais Cardapio e Dispositivos. A tela de dispositivos agora direciona claramente ao painel operacional.
- Removido o QR Pix demonstrativo que nao processava pagamentos. Pedidos publicos ficam pendentes ate a equipe confirmar o recebimento; vendas manuais do caixa sao registradas como recebidas. Cancelamentos distinguem pagamentos pendentes de pagamentos confirmados.
- Dashboard e relatorio diario passaram a separar recebido e pendente; o inicio do dia usa o fuso de Sao Paulo. Administradores podem confirmar o recebimento pelo relatorio de transacoes.
- Typecheck e build passaram. Build ainda informa bundle principal de aproximadamente 850 KB (acima do limite de aviso de 500 KB).

### Lacunas antes de vender como SaaS multiestabelecimento

- O cardapio, os pedidos e as tabelas operacionais ainda usam dados globais. A cozinha legada so e liberada quando existe exatamente um estabelecimento. Nao cadastrar clientes de estabelecimentos diferentes ate migrar todas as tabelas, funcoes, consultas e politicas para isolamento por `establishment_id`.
- Pix/cartao ainda nao tem provedor de pagamento. A confirmacao manual atual serve para prototipo/operacao local; nao representa conciliacao automatica nem cobranca real.
- Nao ha fluxo completo de entrega com taxa, endereco, despacho e acompanhamento do entregador.
- As permissoes individuais de funcionario ainda precisam ser aplicadas no servidor em cada operacao; antes de comercializar, revisar tambem trilha de auditoria e recuperacao/backup.
- Publicacao atual e um prototipo em GitHub Pages; definir dominio, disponibilidade, monitoramento, suporte, politica de privacidade e termos/LGPD para clientes pagantes.
- Nenhum banco foi alterado nesta revisao. `supabase/.temp/cli-latest` continua local e deve ficar fora do commit.

## Auditoria de prontidao comercial e isolamento multiestabelecimento — 29/10/2026

### Contexto e objetivo

- Objetivo: preparar o Nexus para ser vendido como SaaS para vários estabelecimentos. A integração real de Pix/cartão fica para depois; o modelo de transações deve permitir adicionar um provedor sem simular pagamento confirmado.
- Premissa de trabalho: aplicação compartilhada com dados isolados por estabelecimento. A confirmação do usuário sobre modelo de hospedagem e divisão de permissões ainda está pendente; tratar como premissa até nova resposta.
- Foi instalada e lida a skill oficial `security-threat-model` do repositório `openai/skills`, junto das referências. O relatório final dessa skill ainda não foi produzido porque ela exige validação do contexto com o usuário; perguntas já foram enviadas na conversa.

### Estado do banco real consultado

- Projeto Supabase `phckbsoygqdbkvuxgobr`: uma linha em `establishments`, dois funcionários ativos e tabelas operacionais sem pedidos/produtos/estoque/CRM; existe uma linha de configurações. `employees.establishment_id` dos dois funcionários está nulo no estado consultado.
- Há zero migrações registradas no Supabase, embora o banco tenha sido configurado anteriormente fora do histórico versionado. Antes de qualquer migração, comparar o SQL com o esquema vivo; não presumir que o diretório local descreve o banco.
- RLS está habilitado em tabelas operacionais, mas há políticas de leitura pública amplas em `orders`, `order_items`, `loyalty`, `products`, `settings` e `establishments`. A política de `establishments` expõe a linha inteira, que contém dados sensíveis do titular. As consultas do frontend usam diretamente pedidos por código curto, pedidos/itens, estoque, produtos, promoções, fidelidade e configurações.
- Edge Functions usam `service_role`, que ignora RLS. As funções antigas de pedidos, estoque, clientes, fornecedores e promoções fazem consultas globais e precisam filtrar explicitamente pelo estabelecimento autenticado. `cozinha-login` também ainda contém lógica legada que pressupõe haver um só estabelecimento.
- Parecer de produção: não cadastrar um segundo estabelecimento e não aplicar a migração preparada até que frontend e funções tenham sido migrados juntos para chamadas tenant-scoped. A migração isolada quebraria leituras atuais e o checkout.

### Alterações locais desta sessão (ainda não commitadas)

- `supabase/functions/_shared/helpers.ts`: `requireEmployee` passa a devolver estabelecimento e flags de acesso lidas do banco, valida estabelecimento ativo e inclui fallback de compatibilidade para registros legados sem estabelecimento quando há exatamente um.
- `supabase/functions/gerenciar-dados/index.ts`: adiciona verificação de permissões e filtros por `establishment_id` em ações administrativas/financeiras.
- `supabase/functions/pedidos/index.ts`: checkout público agora valida estabelecimento ativo, limita tentativas, valida carrinho/estoque e grava com o tenant; `manual` exige autenticação e acesso de caixa/ADM; confirmar retirada exige sessão e permissão; ações de cozinha filtram pelo estabelecimento.
- `supabase/functions/estoque`, `clientes`, `promocoes`, `fornecedores` e `gerenciar-funcionarios`: consultas e escritas passaram a incluir o tenant autenticado e controles de permissão. CRM, promoções e fornecedores exigem ADM; estoque exige cozinha/ADM. Funcionários podem ter acessos de cozinha/caixa/ADM configurados no formulário, com validação no servidor e proteção para manter um ADM ativo.
- `supabase/functions/_shared/security.ts`: rate limit falha de forma fechada quando a leitura/gravação no log falha.
- `artifacts/cantinas-nexus/src/lib/api.ts` e `src/pages/Kitchen.tsx`: confirmação de retirada passou a enviar sessão; formulário de funcionário permite editar permissões.
- `supabase/migrations/20261029170000_establishment_tenant_isolation.sql`: rascunho para adicionar tenant IDs, backfill, chaves estrangeiras compostas e remover leituras públicas sensíveis. A revisão contra o esquema vivo corrigiu a ordem de criação/backfill, removeu o uso de `min(uuid)`, antepôs a chave única de clientes à FK composta e incluiu o endurecimento de `cleanup_rate_limit_log()`. Ainda precisa de revisão integral contra as operações do produto. NÃO aplicar nem fazer deploy parcial.
- `artifacts/cantinas-nexus/src/App.tsx`: páginas convertidas para carregamento sob demanda; commit `ce26568` enviado para `main`. O GitHub Actions run `40925947341` concluiu build e deploy com sucesso.
- Essas alterações são uma etapa incompleta, não uma entrega comercial pronta. Em especial, outras Edge Functions e chamadas diretas do frontend ainda não foram migradas para `establishment_id`.
- O helper preserva uma trava global: as APIs legadas só autorizam acesso enquanto há exatamente um estabelecimento ativo e ele corresponde ao usuário. Não remover essa trava antes de migrar e revisar todas as funções globais; ela é o que impede que o segundo tenant passe a usar caminhos legados sem filtro.

### Verificações executadas

- `npm.cmd run typecheck` em `artifacts/cantinas-nexus`: passou.
- Após os controles de permissão no formulário de funcionários, `npm.cmd run typecheck` passou novamente.
- `npm.cmd run build` em `artifacts/cantinas-nexus`: passou. A primeira saída desta sessão manteve chunk de aprox. 850 kB; depois, `App.tsx` passou a carregar as páginas sob demanda (React `lazy`/`Suspense`) e o chunk inicial caiu para aprox. 486 kB, sem aviso de chunk acima de 500 kB. Kitchen (92 kB) e páginas são carregadas em chunks próprios.
- `git diff --check`: passou antes da última revisão do SQL; repetir após as alterações pendentes. Não foi possível validar Edge Functions com Deno porque `deno` não está instalado/disponível neste ambiente.
- Nenhum teste automatizado foi executado.
- Nenhuma migração de banco nem deploy de Edge Function foi feito; o código desta auditoria continua sem commit/push. Commits de documentação e do frontend lazy-loading estão registrados abaixo.

### Próximas etapas obrigatórias antes de vender

1. Confirmar o modelo de hospedagem e as permissões de dono, ADM, cozinha e caixa.
2. Fazer inventário tabela por tabela e ação por ação das Edge Functions com base no esquema vivo; garantir que toda query com `service_role` fixa o tenant derivado da sessão, nunca do payload confiado do cliente.
3. Projetar primeiro caminhos seguros para cardápio público e dispositivos (credencial aleatória revogável, não ID do dispositivo), checkout com idempotência/validação de preço no servidor e acompanhamento com token aleatório, além de limitar por estabelecimento.
4. Migrar clientes, fidelidade e dados operacionais para tenant-scoped; retirar políticas públicas que expõem dados pessoais/financeiros e substituir apenas o que precisa ser público por projeções mínimas.
5. Aplicar autorização por função no servidor para cada ação; a interface pode esconder ações, mas não é controle de segurança.
6. Corrigir privilégios da função `cleanup_rate_limit_log()` e verificar os avisos do Security/Performance Advisor após a migração.
7. Criar/validar migrações versionadas; fazer deploy coordenado somente quando o cliente e as funções estiverem compatíveis. Depois revisar logs, advisors e fluxos de ponta a ponta.
8. Antes da venda: domínio e publicação confiável, backup/recuperação, monitoramento, suporte, termos e privacidade/LGPD; Pix/cartão fica explicitamente pendente de seleção de provedor.

### Estado do Git ao salvar este bloco

- Há alterações locais em `supabase/functions/_shared/helpers.ts`, `supabase/functions/gerenciar-dados/index.ts` e a nova pasta `supabase/migrations/`.
- `supabase/.temp/cli-latest` estava modificado antes desta sessão; não incluir em commit. Conferir `git status -sb` antes de continuar.
- O checkpoint anterior está em `c3d61b9`; o frontend foi publicado no commit `ce26568` e este checkpoint foi atualizado no commit `6a9e0e1`. Os patches de helper, função e migração permanecem locais e ainda não foram publicados nem aplicados ao Supabase.

## Handoff completo para trocar de conta Codex no mesmo PC — 29/10/2026

### Como retomar sem perder este workspace

- Pasta aberta no VS Code: `D:\Vini\Nexus company\Nexus-ERP-CRM`.
- Fazer logout/login em outra conta Codex não apaga por si só os arquivos locais. Depois de entrar, manter/abrir exatamente essa mesma pasta no VS Code e iniciar a nova conversa pedindo para ler este checkpoint e conferir `git status --short`.
- O contexto da conversa e a autenticação do Codex não migram automaticamente. Este arquivo guarda o resumo do projeto e o estado do trabalho; a nova conta pode precisar autenticar novamente no GitHub e no Supabase. As alterações abaixo estão neste disco, não no GitHub.
- Antes de qualquer `git pull`, troca de branch, checkout, reset, clean ou restauração do VS Code, conferir e preservar as alterações locais. Não rodar `git reset --hard`, `git clean`, nem sobrescrever os arquivos locais. O arquivo SQL novo está untracked; um stash comum não o inclui sem `-u`.
- Estado Git de origem deste handoff: branch `main`, HEAD `0cac235`. Este novo handoff será commitado somente como documentação; as alterações de código abaixo continuam locais. `supabase/.temp/cli-latest` é uma modificação preexistente do CLI, sem relação com o trabalho; preservar e não incluir em commit.

### Inventário exato das alterações locais a preservar

- `artifacts/cantinas-nexus/src/lib/api.ts`: checkout aceita `establishmentId`; confirmação de retirada passou de chamada pública para chamada autenticada.
- `artifacts/cantinas-nexus/src/pages/Home.tsx`: envia o `nexus:establishmentId` da sessão no checkout.
- `artifacts/cantinas-nexus/src/pages/Kitchen.tsx`: formulário ADM passa a editar permissões cozinha/caixa/ADM; inclui flags no usuário local que representa o dono.
- `supabase/functions/_shared/helpers.ts`: claims de funcionário incluem tenant e permissões; autenticação é baseada em Auth + linha protegida em employees; verifica status ativo e mantém trava para somente um estabelecimento enquanto há endpoints globais. Fallback de dono também só libera APIs legadas com um estabelecimento.
- `supabase/functions/_shared/security.ts`: `checkRateLimit` agora falha fechado se consulta ou gravação de log falhar.
- `supabase/functions/cozinha-login/index.ts`: login legado também exige exatamente um estabelecimento ativo e rejeita funcionário vinculado a outro ID.
- `supabase/functions/pedidos/index.ts`: consultas e gravações planejadas com `establishment_id`; checkout valida estabelecimento ativo, carrinho, método e estoque, limita tentativas por IP e estabelecimento; venda manual exige JWT e caixa/ADM; confirmação de retirada exige JWT e caixa/ADM; status/avanço/observações exigem cozinha/ADM e escopo do tenant.
- `supabase/functions/estoque/index.ts`: tenant nas consultas/gravações, valida quantidades inteiras e limites da coluna integer, limita desperdício ao estoque existente, exige cozinha/ADM.
- `supabase/functions/clientes/index.ts`: ações de CRM filtradas por tenant e protegidas para ADM.
- `supabase/functions/promocoes/index.ts`: operações por tenant e protegidas para ADM.
- `supabase/functions/fornecedores/index.ts`: fornecedores e solicitações por tenant e protegidos para ADM.
- `supabase/functions/gerenciar-funcionarios/index.ts`: lista/edição/exclusão escopadas ao tenant; cria Auth + funcionário com estabelecimento e permissões; valida combinações de cargo/permissões e tenta manter pelo menos um ADM ativo.
- `supabase/functions/gerenciar-dados/index.ts`: relatórios e operações já alterados para filtros por tenant/permissões, mas é preciso revisar cada action e dependência antes de deploy.
- `supabase/migrations/20261029170000_establishment_tenant_isolation.sql` (arquivo novo, untracked): rascunho de backfill, colunas tenant, constraints/FKs compostas, revogação de políticas públicas sensíveis e endurecimento da função de limpeza de rate limit. Foram corrigidos alguns erros encontrados na revisão: colunas antes do backfill, seleção de UUID sem `min(uuid)`, chave composta de customer antes da FK e `search_path`/EXECUTE da função definer. Continua sem validação integral e não deve ser aplicada ainda.

### Limites importantes desta etapa

- Nenhum SQL foi aplicado ao Supabase nesta etapa; nenhuma Edge Function foi implantada. As funções acima esperam colunas `establishment_id` que ainda não existem nas tabelas operacionais do banco vivo. Deploy isolado pode falhar em runtime.
- Ainda não há isolamento completo: menu e estoque públicos no frontend, acompanhamento por código curto, leituras públicas diretas e outras ações/funções (incluindo fluxos de cliente, onboarding, dispositivos, diretório, tracking e as actions restantes de pedidos) precisam de inventário e migração. A autenticação single-tenant no helper é uma trava temporária essencial; não removê-la enquanto houver endpoint global.
- Checkout ainda precisa de transação atômica/estoque concorrente, idempotência real e token secreto de acompanhamento. O código curto de pedido não deve ser usado como segredo. A venda de cartão/Pix continua manual/pedente; não existe integração com provedor.
- O processo de funcionário foi ampliado localmente, mas não foi exercitado com conta real. Não publique essas alterações antes de migrar o banco e validar todas as funções que consultam as novas colunas.
- O relatório formal `Nexus-ERP-CRM-threat-model.md` ainda não existe. A skill `security-threat-model` oficial foi instalada localmente e lida. Ela pede validar premissas com o usuário antes de concluir. Perguntas já feitas e sem resposta: (1) SaaS compartilhado multiestabelecimento ou implantação separada por cliente? (2) divisão de permissões desejada para dono/ADM/cozinha/caixa e demais funcionários?

### Verificações mais recentes

- `npm.cmd run typecheck` passou depois do formulário de permissões.
- `git diff --check` passou antes de salvar este handoff.
- O build completo mais recente foi anterior ao formulário de permissões; naquele build, o chunk inicial ficou em aproximadamente 486 kB após lazy loading. Rodar build novamente quando retomar.
- O build/deploy GitHub Pages do commit `ce26568` foi confirmado com sucesso no Actions run `40925947341`. Commits posteriores (`6a9e0e1`, `b0ce316`, `0cac235`) só atualizaram documentação/checkpoint.
- `deno` não está instalado no ambiente; nenhuma checagem de tipos das Edge Functions foi feita. Nenhum teste automatizado foi executado.
- O banco Supabase consultado é `phckbsoygqdbkvuxgobr`; havia uma establishment ativa, dois employees sem tenant link e sem dados operacionais (uma linha de settings). O histórico de migrations do projeto estava vazio, apesar de o schema já existir por alterações anteriores fora de migrations versionadas. Conferir novamente antes de DDL.

### Próxima sequência para a conta nova

1. Ler este handoff inteiro e executar apenas `git status --short` no começo. Confirmar que os arquivos locais citados continuam presentes; não fazer pull/reset/checkout.
2. Ler a skill Supabase em `C:\Users\VNSANTS\.codex\plugins\cache\openai-curated-remote\supabase\1.0.0\skills\supabase\SKILL.md` e a skill de ameaça em `C:\Users\VNSANTS\.codex\skills\security-threat-model\SKILL.md` se esse mesmo perfil Windows ainda existir. Se outra conta não tiver as skills, reinstalar pelo instalador oficial, sem sobrescrever fontes locais.
3. Revisar os diffs das funções e migration contra o schema vivo, corrigir problemas; instalar/usar Deno ou a ferramenta de validação disponível e validar cada Edge Function. Rodar typecheck e build; o build mais recente precisa ser repetido.
4. Completar inventário de todas as funções e chamadas frontend, especialmente `pedidos`, menu público, tracking/QR, cliente/fidelidade, estoque público, login/dispositivos, funções de onboarding e diretório. Não criar segundo estabelecimento até concluir isso.
5. Confirmar com Vinícius premissas multi-tenant e matriz de permissões; então concluir o threat model em `Nexus-ERP-CRM-threat-model.md` com âncoras de arquivo, fluxos, ameaças e mitigação.
6. Só quando app, functions, policies e migração estiverem compatíveis: validar migration em ambiente seguro, comparar impacto no banco, executar deploy coordenado, revisar advisors/logs e só então commit/push do código. Pix/cartão real e provedor seguem fora do escopo imediato.

### Prompt para iniciar a nova conversa Codex

> Continue o Nexus neste mesmo workspace aberto no VS Code. Leia `CHECKPOINT-CONTINUIDADE-CODEX.md` inteiro e confira `git status --short` antes de editar. Preserve todas as alterações locais descritas no checkpoint, incluindo `supabase/migrations/20261029170000_establishment_tenant_isolation.sql`; não faça pull/reset/clean nem deploy agora. Continue a revisão de segurança multiestabelecimento a partir do estado local, valide as Edge Functions antes de publicar e atualize este checkpoint no final. `supabase/.temp/cli-latest` é preexistente e deve ficar fora dos commits.

## Continuidade de auditoria multiestabelecimento — 30/10/2026

### Ações desta sessão

- Leitura integral deste checkpoint e `CANTINAS-NEXUS-PROJETO.md` concluída antes de qualquer edição. Estado inicial confirmado: HEAD `116bc28` (`docs: update Nexus continuation checkpoint`) e alterações locais listadas abaixo preservadas. `supabase/.temp/cli-latest` permanece intocado e fora de qualquer commit.
- Revisão estática iniciada sobre todas as 23 pastas de Edge Functions e chamadas Supabase do frontend. `git diff --check` passou.
- `npm.cmd run typecheck` em `artifacts/cantinas-nexus`: passou.
- `npm.cmd run build` em `artifacts/cantinas-nexus`: passou. Bundle inicial `index-C8cuz29x.js` em 485,60 kB; sem aviso de chunk acima de 500 kB.
- Deno continua indisponível (`Get-Command deno` não encontrou executável); portanto as Edge Functions não foram validadas por Deno e o backend não está validado.
- A reconsulta do projeto `phckbsoygqdbkvuxgobr` foi tentada por Supabase MCP (`list_tables`, `list_migrations`) e negada por permissão. A tentativa somente-leitura pelo Supabase CLI também não avançou: o binário falha ao gravar `C:\Users\VNSANTS\.supabase\telemetry.json` por `EPERM`, inclusive com telemetry disabled. O schema vivo e o estado atual do banco continuam sem confirmação nesta sessão. Nenhum DDL ou deploy foi feito.

### Incompatibilidades confirmadas que bloqueiam migration/deploy

- `artifacts/cantinas-nexus/src/lib/api.ts` ainda consulta diretamente `products`, `orders` por código curto, `order_items`, `loyalty` e `settings`; tracking (`src/pages/Tracking.tsx`) depende dessas leituras. `Home.tsx` também carrega menu/checkout no fluxo público. Essas chamadas precisam de caminhos públicos mínimos e tenant-scoped antes da revogação de privilégios/policies.
- A migration adiciona `tracking_token` e `idempotency_key`, mas os fluxos atuais ainda não usam token secreto de tracking nem idempotência real. A criação do pedido e baixa de estoque continuam em múltiplas chamadas, sem transação atômica/controle concorrente.
- A migration assume nomes exatos de constraints existentes em `stock`, `order_items`, `supply_requests`, `customers`, `loyalty`, `daily_counter` e `settings`; sem schema vivo não é possível confirmar que os `DROP CONSTRAINT` e PKs correspondem ao banco atual. Não aplicar.
- A revisão estática das Edge Functions segue incompleta, especialmente das actions restantes de `pedidos`, das funções públicas de menu/tracking/dispositivo, onboarding/cadastro de cliente e das policies reais. O fato de várias funções operacionais adicionarem filtros `establishment_id` não confirma compatibilidade geral.
- Não criar segundo estabelecimento. Não publicar funções que consultam `establishment_id` enquanto as colunas ainda não existem no banco operacional.

### Estado local preservado

- Permanecem sem commit as alterações previamente inventariadas no handoff, incluindo frontend, helpers/security e funções `clientes`, `cozinha-login`, `estoque`, `fornecedores`, `gerenciar-dados`, `gerenciar-funcionarios`, `pedidos`, `promocoes`, além de `supabase/migrations/20261029170000_establishment_tenant_isolation.sql`.
- `supabase/.temp/cli-latest` segue modificado, preservado e excluído de commits.
- Nenhum commit, push, deploy ou alteração do banco foi feito nesta sessão.

### Próxima ação

1. Restaurar acesso somente-leitura ao projeto Supabase (autorizar/conectar o MCP ou permitir o CLI acessar seu diretório de configuração) e reconsultar schema, policies e migrations registradas.
2. Completar a matriz de queries/actions das 23 Edge Functions e de todas as leituras/escritas frontend; migrar menu, checkout e tracking para contratos tenant-scoped compatíveis, inclusive token e idempotência.
3. Revisar/corrigir a migration comparando cada coluna, constraint, índice e policy com o schema vivo.
4. Disponibilizar Deno e validar cada função; repetir `git diff --check`, typecheck e build após mudanças.
5. Só então propor deploy coordenado e aplicação da migration. Pix/cartão real continua fora do escopo; pagamentos permanecem pendentes/manuais.

## Retomada em outra conta Codex — 30/10/2026

- O usuário confirmou que está usando outra conta Codex na mesma pasta do VS Code e pediu para continuar o trabalho. Nenhuma alteração local foi descartada.
- A skill oficial Supabase foi localizada neste perfil e lida em `C:\Users\VNSANTS\.codex\plugins\cache\openai-curated-remote\supabase\1.0.0\skills\supabase\SKILL.md`; também foi lida a skill Supabase Postgres Best Practices disponível neste perfil.
- A migration local `20261029170000_establishment_tenant_isolation.sql` contém `DROP CONSTRAINT settings_singleton` antes de substituir a chave de `settings`; isso corresponde à correção relatada pelo usuário na outra sessão. A migration continua sem aplicação.
- Tentativas pela conexão Supabase MCP desta conta (`list_tables`, `list_migrations`, advisors de segurança e performance) retornaram `You do not have permission to perform this action`. Portanto não foi possível confirmar schema, policies, histórico de migrações ou advisories do banco vivo. Não executar DDL/deploy até recuperar acesso e comparar o schema.
- Confirmada na revisão local a dependência de leituras diretas do Data API: `api.products.list`, `api.orders.list`, `api.orders.byCode`, `api.promotions.listActive`, `api.customers.loyaltyByPhone` e `api.settings.get` consultam tabelas diretamente. `orders.byCode` usa código curto para obter pedido e itens; não é um segredo de acompanhamento. Essas leituras ainda não estão substituídas por contratos mínimos e escopados. A migration revoga acesso público a pedidos/itens/fidelidade/estabelecimentos, então publicar a migration antes de migrar os leitores quebra fluxos; manter leitores globais também impede isolamento real.
- A Edge Function `pedidos` ainda cria pedido, itens, baixa de estoque, transação e fidelidade em várias chamadas separadas; faltam atomicidade e idempotência efetiva. A migration adiciona campos para idempotência e tracking, mas os contratos atuais não os usam.
- Nesta retomada foi adicionada uma action autenticada `pedidos?action=list`: exige permissão de cozinha, caixa ou ADM; filtra pedidos e itens pelo estabelecimento da sessão; retorna itens agrupados para a fila da cozinha. `api.orders.list` agora chama essa Edge Function em vez de ler todos os pedidos diretamente pelo Data API. Isso depende da coluna `establishment_id` da migration e não está pronto para deploy isolado.
- O painel da cozinha também passou a obter produtos e configurações por actions autenticadas (`gerenciar-dados?action=list-products` e `get-settings`), filtradas pelo estabelecimento da sessão; a API do frontend e `Kitchen.tsx` usam esses métodos. Isso também depende da migration e não deve ser implantado isoladamente.
- Após essas alterações, `npm.cmd run typecheck` e `npm.cmd run build` em `artifacts/cantinas-nexus` passaram; chunk inicial segue em 485,60 kB. `git diff --check` também passou. Deno continua não instalado, então as Edge Functions alteradas não foram validadas pelo runtime/type checker Deno.
- Não houve commit, push, deploy, teste ou modificação no banco nesta retomada. As mudanças seguem locais, junto do formulário de permissões, helpers/funções tenant-scoped e migration. `supabase/.temp/cli-latest` permanece fora de commits.

### Próximos passos ao retomar

1. A conexão local do Codex agora autentica no projeto e permite `list_tables`, `list_migrations` e advisors. Para obter políticas/contagens via `execute_sql`, a chamada ainda exige aprovação MCP; a execução não interativa com approval `never` bloqueou a consulta. Usar o Codex interativo para aprovar somente os SELECTs de catálogo, sem compartilhar PATs.
2. A action autenticada de listagem de pedidos foi iniciada; completar e validar as APIs separadas: leitura pública mínima de menu/configuração por estabelecimento ativo; acompanhamento público por token aleatório secreto, nunca por código curto. Adicionar rate limit onde o endpoint for público.
3. Mover a criação do pedido/itens/baixa de estoque/transação para uma operação atômica no banco, com validação de estoque concorrente e chave de idempotência validada no servidor.
4. Completar inventário de todas as queries e actions das 23 Edge Functions e do frontend, incluindo permissões de funcionário, cliente, onboarding, dispositivos e storage.
5. Revisar a migration contra o schema vivo. Só aplicar e implantar quando migration, contratos do frontend e todas as functions estiverem compatíveis; validar em seguida advisors, logs e fluxos ponta a ponta.

## Verificação Supabase após configurar OAuth no Codex — 30/10/2026

- `codex mcp list` mostrou o servidor `supabase` habilitado, com OAuth, escopado ao projeto `phckbsoygqdbkvuxgobr` e grupos database/debugging/development/functions/docs.
- Pelo `codex exec` local, `list_tables` e `list_migrations` funcionaram sem erro; o histórico remoto continua vazio. `get_advisors` de segurança e performance também funcionou.
- O schema retornado confirma 24 tabelas públicas e RLS habilitado em todas. Nas tabelas operacionais, os IDs de products/orders/order_items/suppliers são `text`; customer/loyalty identificam por telefone `text`; `settings.id` é integer com `CHECK (id = 1)`; `daily_counter.date` é text. Empregados já têm `establishment_id` e as três flags `acesso_*`.
- As FKs existentes usadas pela migration foram confirmadas: `stock_product_id_fkey`, `order_items_order_id_fkey` e `supply_requests_supplier_id_fkey`; as PKs antigas de stock/orders etc. também foram listadas. A migration precisa continuar compatível com esses tipos e constraints.
- Advisories observados: `cleanup_rate_limit_log()` tem search_path mutável e execução SECURITY DEFINER disponível a anon/authenticated; há RLS habilitado sem policies em várias tabelas privadas; advisors de performance apontam FKs sem índice e índices duplicados em `rate_limit_log`. A migration local tenta corrigir o problema da função de limpeza; os demais advisories exigem revisão separada.
- A consulta SQL somente-leitura a `pg_constraint`/`pg_policies`/contagens não foi executada: o MCP exige aprovação explícita para `execute_sql`, mas a sessão `codex exec` atual usa `approval=never`. Nenhum SQL, DDL, deploy, migration ou escrita ocorreu.
- Com base no schema observado, a migration foi ajustada localmente: o backfill das permissões antigas ficou explícito (`acesso_cozinha=true`, `acesso_caixa=true`, ADM apenas para `role='admin'`) e `employees.establishment_id` passa a `NOT NULL` após preencher os vínculos existentes. Isso ainda requer validação final contra as policies e execução planejada no ambiente correto; não foi aplicado ao Supabase.

### Consulta SELECT autorizada concluída

- A conexão OAuth foi aprovada no Codex CLI e uma consulta `SELECT` foi executada com aprovação explícita; nenhuma escrita, migration ou deploy ocorreu.
- Contagens confirmadas: `establishments=1`, `employees=2`, `establishment_owners=1`, `establishment_requests=1`, `establishment_devices=1`, `customer_accounts=1`, `platform_admins=1`, `settings=1`; `products`, `orders`, `order_items`, `stock`, `customers`, `customer_interactions`, `promotions`, `transactions`, `loyalty`, `suppliers`, `supply_requests`, `stock_history`, `waste_log`, `daily_counter` estão vazias; `rate_limit_log=39`.
- Os nomes exatos assumidos pela migration foram confirmados no banco: `stock_product_id_fkey`, `stock_pkey`, `order_items_order_id_fkey`, `supply_requests_supplier_id_fkey`, `customers_pkey`, `daily_counter_pkey`, `settings_pkey` e `settings_singleton`. A alteração da chave de settings para `(establishment_id, id)` está alinhada ao schema atual.
- Policies públicas atuais: `products` permite SELECT com `true`; `promotions` permite SELECT quando `ativo=true`; `settings`, `establishments`, `orders`, `order_items` e `loyalty` têm SELECT público amplo. A migration remove as policies de estabelecimento, pedidos, itens e fidelidade e revoga privilégios; os leitores públicos precisam ser migrados antes da aplicação.
- As funções RLS/privadas não têm policies próprias em várias tabelas, conforme advisor; isso é compatível com o uso via service role nas Edge Functions, mas exige que cada action valide sessão e estabelecimento.
- Consulta adicional autorizada confirmou: estabelecimento ativo `7a509d84-7cec-4278-8a8f-2c7ff6b093fb`; os dois funcionários ativos ainda têm `establishment_id=null` e todas as flags `acesso_*` falsas; há um dispositivo ativo ligado a esse estabelecimento; settings possui uma linha `id=1` sem coluna tenant antes da migration. O backfill da migration é necessário para vincular os funcionários e liberar as funções tenant-scoped.
- A migration foi validada em uma transação e depois aplicada ao projeto remoto pelo MCP `supabase/apply_migration` com sucesso, usando o nome `establishment_tenant_isolation`. O banco agora está tenant-scoped; a migration não deve ser reaplicada.
- Edge Functions publicadas depois da migration pelo CLI Supabase: `pedidos` e `cozinha-login` com `verify_jwt=false` (ambas fazem autenticação própria quando necessário); `clientes`, `estoque`, `fornecedores`, `gerenciar-dados`, `gerenciar-funcionarios` e `promocoes` com `verify_jwt=true`. Todas retornaram ACTIVE no projeto.
- Versões após o deploy: `pedidos v16`, `cozinha-login v14`, `clientes v15`, `estoque v15`, `fornecedores v15`, `gerenciar-dados v18`, `gerenciar-funcionarios v16`, `promocoes v15`.
- A listagem remota do CLI confirmou o projeto `phckbsoygqdbkvuxgobr` como `ACTIVE_HEALTHY` e a pasta local como vinculada. O `supabase init` gerou `supabase/config.toml` e `supabase/.gitignore`; esses arquivos podem ser versionados. Arquivos de `supabase/.temp/` continuam fora do commit.
- O estado local e a migration/funções/frontend foram commitados e enviados para `origin/main` no commit `0068a9c` (`feat: apply establishment tenant isolation`). O build final do frontend passou com chunk inicial de 485,60 kB. A publicação do GitHub Pages deve ser acompanhada pelo workflow acionado por esse commit; o GitHub CLI não está instalado neste ambiente para consultar o run por terminal.
- Estado final esperado do Git: apenas `supabase/.temp/cli-latest`, `supabase/.temp/storage-migration` e `supabase/.temp/storage-version` permanecem modificados localmente por metadados do CLI; não incluir esses arquivos em commit.

### Correção pós-migration: acompanhamento seguro — 30/10/2026

- A migration revogou a leitura pública direta de `orders` e `order_items`, então o acompanhamento antigo por `.from('orders')` deixaria de funcionar. Foi adicionada a action pública `pedidos?action=track`, que aceita somente o UUID `tracking_token`, aplica rate limit por IP e retorna apenas os campos necessários e os itens do pedido escopados pelo tenant.
- `api.orders.byCode` agora usa essa action; o QR Code do checkout grava `trackingToken` no link. Códigos curtos continuam sendo exibidos como número de chamada, mas não são usados como segredo de consulta.
- `pedidos` foi publicado novamente com `verify_jwt=false`; typecheck, build e `git diff --check` passaram após a alteração. Falta apenas commit/push desta correção frontend/backend.
