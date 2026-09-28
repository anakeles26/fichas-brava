-- RLS (Row-Level Security) do FichaBase — segunda camada de isolamento
-- multi-tenant, além do filtro em Python (fichabase.auth.empresa_atual).
--
-- Por que uma segunda camada: hoje toda página filtra `WHERE empresa_id =
-- ...` em Python. Isso funciona, mas depende de ninguém esquecer o filtro
-- numa query nova. RLS move essa regra pro banco: mesmo que uma query futura
-- esqueça o WHERE, o Postgres não devolve linha de outra empresa.
--
-- Como funciona: cada página, ao resolver a empresa atual (auth.empresa_atual
-- -> fichabase.rls.aplicar_escopo_rls), seta a variável de sessão
-- `app.current_empresa_id` via `set_config(..., is_local=true)` — dura só a
-- transação, sem risco de vazar entre requisições que reusam a mesma conexão
-- do pool. As políticas abaixo leem essa variável com `current_setting`.
--
-- Escopo: as tabelas de dado operacional por empresa
-- (insumos, categorias, receitas, receita_insumos, passos_preparo,
-- log_auditoria), filtradas por empresa_id — e mais `receita_alergenos`
-- (associação N:N), filtrada via receita_id -> receitas.empresa_id, no
-- mesmo padrão de receita_insumos/passos_preparo.
--
-- `usuarios`/`empresas`/`alergenos` NÃO são filtradas por empresa (o login
-- via streamlit-authenticator precisa ler a tabela usuarios inteira ANTES de
-- saber quem está logando, e alergenos é catálogo global) — mas o Supabase
-- ativa RLS por padrão em toda tabela nova, e RLS ligado sem NENHUMA política
-- bloqueia geral, não libera geral. Por isso essas três recebem uma política
-- permissiva restrita à role da aplicação (`to fichabase_app`), sem filtro
-- de empresa: fecha o acesso via API pública do Supabase (roles `anon`/
-- `authenticated`, que continuam sem nenhuma política = sem acesso) e ao
-- mesmo tempo não quebra o login. Descoberto testando contra o Postgres real
-- do Supabase — a policy antiga (sem isso) deixava essas 3 tabelas
-- inacessíveis pra qualquer role sem BYPASSRLS.
--
-- Pré-requisito de role: a conexão da aplicação PRECISA usar uma role sem o
-- atributo BYPASSRLS (ex: `fichabase_app`, criada à parte — nunca a role
-- `postgres` do Supabase, que tem BYPASSRLS e ignora todas as políticas
-- abaixo silenciosamente). Ver README para o script de criação da role.
--
-- Pré-requisitos: rode isso DEPOIS de as tabelas existirem no Postgres
-- (`alembic upgrade head`).
--
-- Uso:
--   psql "$DATABASE_URL" -f sql/rls_policies.sql
-- ou cole no SQL Editor do Supabase.

begin;

-- ── insumos ────────────────────────────────────────────────────────────
alter table insumos enable row level security;
alter table insumos force row level security;

drop policy if exists insumos_por_empresa on insumos;
create policy insumos_por_empresa on insumos
  for all
  using (empresa_id = (select current_setting('app.current_empresa_id', true))::bigint)
  with check (empresa_id = (select current_setting('app.current_empresa_id', true))::bigint);

-- ── categorias ─────────────────────────────────────────────────────────
alter table categorias enable row level security;
alter table categorias force row level security;

drop policy if exists categorias_por_empresa on categorias;
create policy categorias_por_empresa on categorias
  for all
  using (empresa_id = (select current_setting('app.current_empresa_id', true))::bigint)
  with check (empresa_id = (select current_setting('app.current_empresa_id', true))::bigint);

-- ── receitas ───────────────────────────────────────────────────────────
alter table receitas enable row level security;
alter table receitas force row level security;

drop policy if exists receitas_por_empresa on receitas;
create policy receitas_por_empresa on receitas
  for all
  using (empresa_id = (select current_setting('app.current_empresa_id', true))::bigint)
  with check (empresa_id = (select current_setting('app.current_empresa_id', true))::bigint);

-- ── receita_insumos (sem empresa_id direto — via receitas) ────────────────
alter table receita_insumos enable row level security;
alter table receita_insumos force row level security;

drop policy if exists receita_insumos_por_empresa on receita_insumos;
create policy receita_insumos_por_empresa on receita_insumos
  for all
  using (
    receita_id in (
      select id from receitas
      where empresa_id = (select current_setting('app.current_empresa_id', true))::bigint
    )
  )
  with check (
    receita_id in (
      select id from receitas
      where empresa_id = (select current_setting('app.current_empresa_id', true))::bigint
    )
  );

-- ── passos_preparo (sem empresa_id direto — via receitas) ─────────────────
alter table passos_preparo enable row level security;
alter table passos_preparo force row level security;

drop policy if exists passos_preparo_por_empresa on passos_preparo;
create policy passos_preparo_por_empresa on passos_preparo
  for all
  using (
    receita_id in (
      select id from receitas
      where empresa_id = (select current_setting('app.current_empresa_id', true))::bigint
    )
  )
  with check (
    receita_id in (
      select id from receitas
      where empresa_id = (select current_setting('app.current_empresa_id', true))::bigint
    )
  );

-- ── receita_alergenos (associação N:N, sem empresa_id direto) ─────────────
alter table receita_alergenos enable row level security;
alter table receita_alergenos force row level security;

drop policy if exists receita_alergenos_por_empresa on receita_alergenos;
create policy receita_alergenos_por_empresa on receita_alergenos
  for all
  using (
    receita_id in (
      select id from receitas
      where empresa_id = (select current_setting('app.current_empresa_id', true))::bigint
    )
  )
  with check (
    receita_id in (
      select id from receitas
      where empresa_id = (select current_setting('app.current_empresa_id', true))::bigint
    )
  );

-- ── empresas / usuarios / alergenos ────────────────────────────────────
-- Sem filtro de empresa (ver explicação no topo do arquivo) — só a role da
-- aplicação tem acesso; `anon`/`authenticated` (API pública do Supabase)
-- continuam sem nenhuma política, ou seja, sem acesso algum.
alter table empresas enable row level security;
alter table empresas force row level security;

drop policy if exists empresas_role_app on empresas;
create policy empresas_role_app on empresas
  for all
  to fichabase_app
  using (true)
  with check (true);

alter table usuarios enable row level security;
alter table usuarios force row level security;

drop policy if exists usuarios_role_app on usuarios;
create policy usuarios_role_app on usuarios
  for all
  to fichabase_app
  using (true)
  with check (true);

alter table alergenos enable row level security;
alter table alergenos force row level security;

drop policy if exists alergenos_role_app on alergenos;
create policy alergenos_role_app on alergenos
  for all
  to fichabase_app
  using (true)
  with check (true);

-- ── log_auditoria ──────────────────────────────────────────────────────
-- empresa_id é nullable (ações sem empresa fixa, ex: criar um admin_master
-- ou mexer no catálogo global de alérgenos). Essas linhas já não aparecem
-- pra um usuário comum hoje (filtro Python == empresa.id nunca bate com
-- NULL), então a política SELECT replica esse comportamento liberando NULL
-- geral em vez de tentar restringir por empresa (não teria como). O ponto
-- que faltava na primeira versão desta política: "empresa_id = X" nunca é
-- verdadeiro em SQL quando empresa_id é NULL (lógica de 3 valores) — sem o
-- "OR empresa_id IS NULL" explícito no WITH CHECK, a política bloqueava até
-- a *criação* dessas linhas (não só escondia na leitura), quebrando ações
-- legítimas como criar um usuário admin_master. Só apareceu testando de
-- verdade contra o Postgres.
alter table log_auditoria enable row level security;
alter table log_auditoria force row level security;

drop policy if exists log_auditoria_por_empresa on log_auditoria;
create policy log_auditoria_por_empresa on log_auditoria
  for all
  using (
    empresa_id = (select current_setting('app.current_empresa_id', true))::bigint
    or empresa_id is null
  )
  with check (
    empresa_id = (select current_setting('app.current_empresa_id', true))::bigint
    or empresa_id is null
  );

-- ── acessos (tela Log de acessos) ────────────────────────────────────────
-- Cada login vira uma linha. empresa_id é nulo no admin master (não tem casa
-- fixa), como em log_auditoria: sem o "or empresa_id is null" explícito, a
-- própria gravação seria bloqueada (empresa_id = X nunca é verdadeiro quando
-- empresa_id é NULL). O admin master lê de todas as casas.
alter table acessos enable row level security;
alter table acessos force row level security;
drop policy if exists acessos_por_empresa on acessos;
create policy acessos_por_empresa on acessos
  for all
  using (
    empresa_id = nullif((select current_setting('app.current_empresa_id', true)), '')::bigint
    or empresa_id is null
    or (select current_setting('app.is_admin_master', true)) = 'true'
  )
  with check (
    empresa_id = nullif((select current_setting('app.current_empresa_id', true)), '')::bigint
    or empresa_id is null
  );

grant select, insert, update, delete on acessos to fichabase_app;
grant usage, select on sequence acessos_id_seq to fichabase_app;

commit;
