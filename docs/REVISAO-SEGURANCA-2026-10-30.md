# Revisão de segurança do catálogo Vibe Coding

**Data:** 30/10/2026  
**Escopo:** catálogo `catalogo_falhas_seguranca_vibe_coding.md`, frontend React/Vite, Supabase Edge Functions, Postgres/RLS e Storage do projeto `phckbsoygqdbkvuxgobr`.

## Modelo resumido

- **Ativos:** pedidos e acompanhamento, telefones/clientes/fidelidade, dados e configurações de cada estabelecimento, estoque, credenciais de funcionários e imagens do cardápio.
- **Fronteiras:** navegador público → Edge Functions/API; navegador autenticado → Edge Functions e Storage; Edge Functions com `service_role` → Postgres/Storage; GitHub Actions → GitHub Pages.
- **Ameaças priorizadas:** leitura de dados de outro tenant; escrita/apagamento de imagens de terceiros; enumeração e abuso de login; pedidos duplicados ou estoque vendido além do disponível; exposição de erros e vulnerabilidades de dependências.

## Correções aplicadas

- Leitura direta e ampla de `products`, `promotions` e `settings` foi revogada para `anon`/`authenticated`. O cardápio, estoque mínimo, promoções e configurações públicas passam por `pedidos?action=menu`, que valida estabelecimento ativo, limita consultas por IP e devolve apenas os campos necessários.
- A consulta de fidelidade exige sessão de cliente e usa o telefone da própria conta, sem aceitar telefone arbitrário.
- O endpoint de login por e-mail/CPF/telefone autentica com senha dentro da Edge Function, aplica limite por IP e retorna mensagem genérica para credenciais inválidas, sem revelar e-mail associado ao identificador.
- Uploads de fotos agora exigem autorização de funcionário, são limitados a WebP de até 5 MB e usam caminho dentro do tenant e token de upload assinado. Escrita, substituição e remoção diretas no Storage foram removidas; leitura pública das imagens foi mantida.
- Checkout, itens, transação, baixa de estoque, contador diário e fidelidade foram reunidos em `checkout_order_atomic`, com bloqueio de linhas e chave de idempotência. Um smoke test dentro de transação revertida confirmou que uma repetição não duplica pedido nem baixa estoque novamente.
- Erros inesperados do checkout não devolvem mensagens internas do Postgres ao cliente.
- Dependências de produção vulneráveis foram atualizadas/forçadas para versões corrigidas. `pnpm audit --prod` não encontrou vulnerabilidades conhecidas.
- Histórico local de migrations foi alinhado com a migration de isolamento já aplicada no banco.

## Evidência de produção

- As migrations locais e remotas estão alinhadas até `20261030144820`.
- `anon` e `authenticated` não têm privilégios diretos nas tabelas `products`, `promotions` e `settings`.
- A única policy de Storage em `product-images` é `SELECT`; bucket limita uploads a WebP e 5 MB.
- `checkout_order_atomic` é executável por `service_role`; não por `anon` nem `authenticated`.
- `customer_insights(uuid)` é executável somente por `service_role`; smoke test transacional validou normalização de telefone, agregados do CRM e rollback dos dados temporários.
- Typecheck do workspace e build de produção do frontend passaram. As Edge Functions afetadas passaram em `deno check` e foram publicadas.
- O advisor Supabase de segurança não reportou outros avisos `WARN` além do item abaixo.
- Commits publicados anteriormente: `5869f03` e `c0a29a4`. As mudanças desta revisão ainda aguardam commit/push para publicar o frontend.

## Pendente no painel Supabase

O advisor `auth_leaked_password_protection` informa que a proteção contra senhas vazadas está desligada. A configuração fica no Supabase Auth e não foi possível alterar pelo CLI disponível nem pela interface do navegador desta sessão. Ativar no Dashboard em **Authentication → Settings/Security and Protection → Leaked password protection** e verificar novamente o advisor.

## Limites do escopo

- Checkout e cobrança permanecem sem integração de gateway Pix/cartão; conciliação automática depende da escolha de provedor.
- O login agora valida cada funcionário pelo `establishment_id` associado e pelo estado ativo daquele estabelecimento. Funcionários legados sem tenant associado só são aceitos quando existe exatamente um estabelecimento ativo.
- `security-threat-model` e advisors só enxergam o repositório/configuração consultada; não substituem revisão recorrente de mudanças futuras, gestão de backup/restauração ou revisão jurídica/operacional de LGPD.

## Revisão funcional adicional

- O CRM deixou de calcular métricas a partir dos 500 pedidos mais recentes e passou a usar agregação completa no banco, limitada ao estabelecimento autenticado.
- As telas de funcionário respeitam a permissão de cozinha/caixa para mostrar ações disponíveis; relatórios diários e horários usam o dia e hora de `America/Sao_Paulo`.
- A redefinição de senha de clientes não é mais redirecionada ao onboarding do estabelecimento. Erros ao criar/atualizar produto e estoque agora são retornados ao usuário; criação de produto tenta reverter o registro se o estoque inicial falhar.
