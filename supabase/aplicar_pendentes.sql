-- Fichas Brava: migrações 06 a 09 (usuários, papéis, alérgenos no log, log de acessos).
-- Cole tudo no SQL Editor do Supabase e clique em Run. Rode UMA vez só.
begin;

-- ===== 20260930000006_log_usuarios.sql =====
-- Fichas Brava — Entrega 3: a gestão cria e altera acessos pelo app; isso entra no log.
alter table public.log_auditoria drop constraint log_auditoria_entidade_check;
alter table public.log_auditoria add constraint log_auditoria_entidade_check
    check (entidade in ('ficha', 'insumo', 'categoria', 'planilha', 'usuario'));

-- ===== 20260930000007_quatro_papeis.sql =====
-- Fichas Brava — Entrega 3: os quatro papéis do app antigo.
--   admin_master, admin, lider = podem cadastrar e editar (sou_gestao() continua sendo o
--   único portão das políticas); usuario = só consulta.
-- Quem pode criar/alterar quem (ninguém mexe em papel acima do seu) é regra do app, que
-- grava os perfis com a chave de serviço; o usuário logado nunca escreve em perfis.
alter table public.perfis drop constraint perfis_papel_check;
update public.perfis set papel = case papel when 'gestao' then 'admin_master' else 'usuario' end
    where papel in ('gestao', 'cozinha');
alter table public.perfis add constraint perfis_papel_check
    check (papel in ('admin_master', 'admin', 'lider', 'usuario'));

create or replace function public.sou_gestao() returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.perfis p
        where p.id = auth.uid() and p.ativo and p.papel in ('admin_master', 'admin', 'lider')
    )
$$;

-- ===== 20260930000008_log_alergenos.sql =====
-- Fichas Brava — Entrega 3: o catálogo de alérgenos é editado pelo app e entra no log.
alter table public.log_auditoria drop constraint log_auditoria_entidade_check;
alter table public.log_auditoria add constraint log_auditoria_entidade_check
    check (entidade in ('ficha', 'insumo', 'categoria', 'planilha', 'usuario', 'alergeno'));

-- ===== 20260930000009_acessos.sql =====
-- Fichas Brava — Entrega 3: log de acessos (uma linha por login). Cada pessoa grava só o
-- próprio acesso, na própria casa; quem pode editar lê os da casa; ninguém altera nem apaga.
create table public.acessos (
    id bigint generated always as identity primary key,
    empresa_id bigint not null references public.empresas (id),
    usuario_id uuid not null references public.perfis (id),
    criado_em timestamptz not null default now()
);
create index acessos_empresa_data_idx on public.acessos (empresa_id, criado_em desc);
create index acessos_usuario_idx on public.acessos (usuario_id);

alter table public.acessos enable row level security;
revoke all on public.acessos from anon;
grant select, insert on public.acessos to authenticated;

create policy acessos_ler on public.acessos for select to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));
create policy acessos_criar on public.acessos for insert to authenticated
    with check (usuario_id = (select auth.uid()) and empresa_id = (select public.minha_empresa()));

commit;
