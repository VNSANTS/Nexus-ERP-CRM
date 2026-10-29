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
- `supabase/migrations/20261029170000_establishment_tenant_isolation.sql`: rascunho para adicionar tenant IDs, backfill, chaves estrangeiras compostas e remover leituras públicas sensíveis. A revisão contra o esquema vivo corrigiu a ordem de criação/backfill, removeu o uso de `min(uuid)`, antepôs a chave única de clientes à FK composta e incluiu o endurecimento de `cleanup_rate_limit_log()`. Ainda precisa de revisão integral contra as operações do produto. NÃO aplicar nem fazer deploy parcial.
- `artifacts/cantinas-nexus/src/App.tsx`: páginas convertidas para carregamento sob demanda; commit `ce26568` enviado para `main`. O GitHub Actions run `40925947341` concluiu build e deploy com sucesso.
- Essas alterações são uma etapa incompleta, não uma entrega comercial pronta. Em especial, outras Edge Functions e chamadas diretas do frontend ainda não foram migradas para `establishment_id`.
- O helper preserva uma trava global: as APIs legadas só autorizam acesso enquanto há exatamente um estabelecimento ativo e ele corresponde ao usuário. Não remover essa trava antes de migrar e revisar todas as funções globais; ela é o que impede que o segundo tenant passe a usar caminhos legados sem filtro.

### Verificações executadas

- `npm.cmd run typecheck` em `artifacts/cantinas-nexus`: passou.
- `npm.cmd run build` em `artifacts/cantinas-nexus`: passou. A primeira saída desta sessão manteve chunk de aprox. 850 kB; depois, `App.tsx` passou a carregar as páginas sob demanda (React `lazy`/`Suspense`) e o chunk inicial caiu para aprox. 486 kB, sem aviso de chunk acima de 500 kB. Kitchen (92 kB) e páginas são carregadas em chunks próprios.
- `git diff --check`: passou antes da última revisão do SQL; repetir após as alterações pendentes. Não foi possível validar Edge Functions com Deno porque `deno` não está instalado/disponível neste ambiente.
- Nenhum teste automatizado foi executado.
- Nenhuma migração de banco, deploy de Edge Function, commit ou push foi feito nesta etapa.

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
