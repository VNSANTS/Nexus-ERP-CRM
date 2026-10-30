# Checkpoint — gestão de usuários finais

Data: 30/10/2026

## Estado

- Commit atual: `942abc3 feat: add platform user management dashboard`.
- Branch `main` sincronizada com `origin/main`.
- O arquivo pessoal `catalogo_falhas_seguranca_vibe_coding.md` permanece fora do Git.

## O que foi implementado

- O painel `/nxs` ganhou uma seção separada: **Usuários do sistema**.
- O dashboard mostra total de contas, cadastros completos, novos usuários nos últimos 30 dias e pedidos nos últimos 30 dias.
- A listagem permite buscar por nome, e-mail, telefone ou CPF.
- Cada conta mostra status do cadastro e data de criação.
- A exclusão definitiva exige confirmação e é autorizada somente para usuários em `platform_admins`.

## Backend publicado

- Edge Function: `gerenciar-usuarios-plataforma`.
- Projeto Supabase: `phckbsoygqdbkvuxgobr`.
- A função valida o Bearer token e a tabela `platform_admins` antes de qualquer ação.
- A listagem e métricas usam `customer_accounts`; exclusão usa `auth.admin.deleteUser`.

## Validação

- Typecheck do frontend passou.
- Build de produção passou.
- `deno check` da Edge Function passou.
- Deploy da Edge Function concluído.
- GitHub Pages iniciou o workflow para o commit `942abc3`; confirmar a conclusão antes do teste visual.

## Próximo teste manual

1. Abrir `/nxs`.
2. Entrar com o administrador da plataforma.
3. Clicar em **Usuários do sistema**.
4. Conferir os quatro cards, a busca e a listagem.
5. Só testar exclusão com uma conta de teste descartável.
