-- Fichas Brava — quem vê e quem edita (Row Level Security).
--
-- Regra geral: cada pessoa só enxerga a própria casa; só o papel "gestao" cria, edita
-- ou exclui. A barreira fica no banco, então vale mesmo que uma tela tenha bug ou que
-- alguém chame a API direto do navegador. Sem login (anon) nada é liberado.

-- Funções auxiliares: security definer para ler perfis sem cair na própria RLS de
-- perfis; search_path vazio para ninguém sequestrar nomes de tabela. Perfil inativo
-- devolve null / false e, com isso, não enxerga nada.
create function public.minha_empresa() returns bigint
language sql stable security definer set search_path = ''
as $$
    select p.empresa_id from public.perfis p where p.id = auth.uid() and p.ativo
$$;

create function public.sou_gestao() returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.perfis p where p.id = auth.uid() and p.ativo and p.papel = 'gestao'
    )
$$;

revoke execute on function public.minha_empresa() from public, anon;
revoke execute on function public.sou_gestao() from public, anon;
grant execute on function public.minha_empresa() to authenticated;
grant execute on function public.sou_gestao() to authenticated;

-- Privilégios: só usuários logados chegam às tabelas; a RLS decide as linhas.
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.categorias, public.insumos, public.fichas,
    public.ficha_itens, public.passos, public.ficha_alergenos to authenticated;

alter table public.empresas enable row level security;
alter table public.perfis enable row level security;
alter table public.categorias enable row level security;
alter table public.insumos enable row level security;
alter table public.fichas enable row level security;
alter table public.ficha_itens enable row level security;
alter table public.passos enable row level security;
alter table public.alergenos enable row level security;
alter table public.ficha_alergenos enable row level security;

-- Casa e perfil: só leitura, e só os próprios.
create policy empresas_ler on public.empresas for select to authenticated
    using (id = (select public.minha_empresa()));

create policy perfis_ler_o_proprio on public.perfis for select to authenticated
    using (id = (select auth.uid()));

create policy alergenos_ler on public.alergenos for select to authenticated
    using (true);

-- Tabelas com casa própria: ler na casa; escrever só gestão, só na casa.
-- ("(select ...)" faz o Postgres calcular a função uma vez por consulta, não por linha.)
create policy categorias_ler on public.categorias for select to authenticated
    using (empresa_id = (select public.minha_empresa()));
create policy categorias_criar on public.categorias for insert to authenticated
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));
create policy categorias_editar on public.categorias for update to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()))
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));
create policy categorias_excluir on public.categorias for delete to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));

create policy insumos_ler on public.insumos for select to authenticated
    using (empresa_id = (select public.minha_empresa()));
create policy insumos_criar on public.insumos for insert to authenticated
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));
create policy insumos_editar on public.insumos for update to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()))
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));
create policy insumos_excluir on public.insumos for delete to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));

create policy fichas_ler on public.fichas for select to authenticated
    using (empresa_id = (select public.minha_empresa()));
create policy fichas_criar on public.fichas for insert to authenticated
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));
create policy fichas_editar on public.fichas for update to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()))
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));
create policy fichas_excluir on public.fichas for delete to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));

-- Tabelas filhas da ficha: valem as regras da ficha pai. A subconsulta em fichas já
-- passa pela RLS de fichas, então "existe" = "a ficha é da minha casa".
create policy passos_ler on public.passos for select to authenticated
    using (exists (select 1 from public.fichas f where f.id = ficha_id));
create policy passos_escrever on public.passos for all to authenticated
    using ((select public.sou_gestao()) and exists (select 1 from public.fichas f where f.id = ficha_id))
    with check ((select public.sou_gestao()) and exists (select 1 from public.fichas f where f.id = ficha_id));

create policy ficha_alergenos_ler on public.ficha_alergenos for select to authenticated
    using (exists (select 1 from public.fichas f where f.id = ficha_id));
create policy ficha_alergenos_escrever on public.ficha_alergenos for all to authenticated
    using ((select public.sou_gestao()) and exists (select 1 from public.fichas f where f.id = ficha_id))
    with check ((select public.sou_gestao()) and exists (select 1 from public.fichas f where f.id = ficha_id));

-- Itens: além da ficha pai, o insumo ou a sub-ficha usados também precisam ser da
-- mesma casa (senão uma casa poderia apontar para o insumo de outra).
create policy ficha_itens_ler on public.ficha_itens for select to authenticated
    using (exists (select 1 from public.fichas f where f.id = ficha_id));
create policy ficha_itens_escrever on public.ficha_itens for all to authenticated
    using ((select public.sou_gestao()) and exists (select 1 from public.fichas f where f.id = ficha_id))
    with check (
        (select public.sou_gestao())
        and exists (select 1 from public.fichas f where f.id = ficha_id)
        and (insumo_id is null or exists (select 1 from public.insumos i where i.id = insumo_id))
        and (sub_ficha_id is null or exists (select 1 from public.fichas s where s.id = sub_ficha_id))
    );
