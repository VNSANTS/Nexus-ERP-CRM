# Backup lógico Supabase no Windows (procedimento do proprietário)

**Estado:** procedimento documentado; nenhum dump foi criado ou validado por esta sessão. Não trate o repositório como backup.

Este fluxo usa ferramentas gratuitas e mantém os arquivos fora do Git. Execute-o no Windows em uma sessão privada, sem compartilhar o terminal, gravação de tela ou pasta de backup. O dump pode conter dados pessoais e comerciais.

## O que o dump cobre

A CLI oficial aplica filtros próprios do Supabase e gera roles, esquema e dados. O dump padrão exclui os esquemas gerenciados auth e storage; portanto, **não contém contas Auth nem os objetos binários do Storage**. As configurações de Auth, segredos, funções Edge e arquivos do Storage precisam de procedimentos de recuperação separados. Não é um backup completo do projeto Supabase.

Referências oficiais: [CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump) e [backups Supabase](https://supabase.com/docs/guides/platform/backups).

## Criar os arquivos

1. Instale/atualize Supabase CLI, Docker Desktop e PostgreSQL client tools pelos sites oficiais. Não é necessário contratar plano ou habilitar add-on.
2. Abra PowerShell no checkout local do repositório e autentique a CLI interativamente. Nunca passe token ou senha como argumento nem os coloque no histórico.
3. Vincule o checkout ao projeto correto. Se a CLI solicitar senha do banco, digite-a somente no prompt interativo:

~~~powershell
supabase login
supabase link --project-ref phckbsoygqdbkvuxgobr
~~~

4. Crie uma pasta privada fora do repositório. O exemplo abaixo restringe acesso ao usuário atual:

~~~powershell
$backupDir = Join-Path $env:USERPROFILE ("Backups\Nexus-Supabase-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
icacls $backupDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F"
~~~

5. Exporte roles, esquema e dados. A CLI usa Docker e precisa de conexão ao banco:

~~~powershell
supabase db dump -f (Join-Path $backupDir "roles.sql") --role-only
if ($LASTEXITCODE -ne 0) { throw "Falha no dump de roles" }

supabase db dump -f (Join-Path $backupDir "schema.sql")
if ($LASTEXITCODE -ne 0) { throw "Falha no dump de esquema" }

supabase db dump -f (Join-Path $backupDir "data.sql") --data-only --use-copy
if ($LASTEXITCODE -ne 0) { throw "Falha no dump de dados" }
~~~

6. Verifique arquivos não vazios e gere hashes para detectar corrupção durante cópia:

~~~powershell
$files = @("roles.sql", "schema.sql", "data.sql") | ForEach-Object { Join-Path $backupDir $_ }
foreach ($file in $files) {
  if (!(Test-Path $file) -or (Get-Item $file).Length -eq 0) { throw "Arquivo ausente ou vazio" }
}
Get-FileHash $files -Algorithm SHA256
~~~

Guarde os hashes separadamente da pasta de backup. Mantenha a pasta em disco protegido/criptografado; não a envie ao GitHub, Drive compartilhado, logs ou chat. Confira git status --short para garantir que nada foi criado no checkout.

## Validar uma restauração isolada

Faça isto em uma pasta temporária vazia, nunca no projeto hospedado nem no banco local de trabalho:

1. Crie uma pasta temporária fora do checkout, execute supabase init e depois supabase start para iniciar uma instância local descartável. Não a exponha à rede pública.
2. Obtenha a URL do banco local com supabase status -o env; confirme que o host é loopback e a porta local mostrada pela CLI.
3. Use os clients psql instalados com PostgreSQL para restaurar, interrompendo em qualquer erro:

~~~powershell
$localDbUrl = Read-Host "Cole somente a DB_URL local exibida por supabase status (loopback)"
& psql --single-transaction --set ON_ERROR_STOP=1 --file (Join-Path $backupDir "roles.sql") --file (Join-Path $backupDir "schema.sql") --command "SET session_replication_role = replica" --file (Join-Path $backupDir "data.sql") --dbname $localDbUrl
if ($LASTEXITCODE -ne 0) { throw "Restauração isolada falhou; não use os arquivos para alterar produção" }
~~~

4. Compare hashes dos arquivos antes/depois da cópia e valide tabelas-chave, contagens e relacionamentos com consultas somente de leitura. Registre apenas totais agregados, sem exportar linhas de clientes.
5. Ao concluir, pare apenas essa instância temporária com supabase stop e remova a pasta descartável depois de decidir se precisa preservá-la como evidência.

**Limites:** Read-Host é intencional para evitar salvar a URL local no histórico. A URL solicitada nesta etapa é exclusivamente a do banco loopback; nunca cole a URL de produção aqui. O restore local prova compatibilidade do dump SQL, mas não restaura Auth, Storage, Edge Functions, secrets, SMTP nem configurações do dashboard.
