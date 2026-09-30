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
