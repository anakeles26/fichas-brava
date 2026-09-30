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
