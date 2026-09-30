-- Fichas Brava — Entrega 2: cadastro pelo app.
--
-- Toda gravação feita pelo app passa por uma função (RPC) deste arquivo. Cada função roda
-- numa transação só — grava a mudança E o registro de auditoria juntos, ou nada — e é
-- "security invoker": a RLS da Entrega 1 continua valendo por dentro, então o login da
-- cozinha é recusado mesmo chamando a função direto pela API.

-- ── Colunas novas ──────────────────────────────────────────────────────────
alter table public.fichas
    add column verificada_em timestamptz,
    add column verificada_por uuid references public.perfis (id);
create index fichas_verificada_por_idx on public.fichas (verificada_por);

-- ── Tabelas novas ──────────────────────────────────────────────────────────

-- Nome como vem na planilha do chef (normalizado: sem acento, maiúsculas, espaços simples)
-- → insumo ou ficha (sub-receita). É o que faz a importação "aprender".
create table public.apelidos (
    id bigint generated always as identity primary key,
    empresa_id bigint not null references public.empresas (id),
    chave text not null check (chave <> ''),
    insumo_id bigint references public.insumos (id) on delete cascade,
    ficha_id bigint references public.fichas (id) on delete cascade,
    criado_em timestamptz not null default now(),
    unique (empresa_id, chave),
    constraint apelidos_um_alvo check ((insumo_id is not null) <> (ficha_id is not null))
);
create index apelidos_insumo_idx on public.apelidos (insumo_id);
create index apelidos_ficha_idx on public.apelidos (ficha_id);

create table public.log_auditoria (
    id bigint generated always as identity primary key,
    empresa_id bigint not null references public.empresas (id),
    usuario_id uuid not null references public.perfis (id),
    acao text not null check (acao in ('criar', 'editar', 'inativar', 'reativar', 'verificar', 'excluir', 'importar')),
    entidade text not null check (entidade in ('ficha', 'insumo', 'categoria', 'planilha')),
    entidade_id bigint,
    descricao text not null,
    criado_em timestamptz not null default now()
);
create index log_auditoria_empresa_data_idx on public.log_auditoria (empresa_id, criado_em desc);
create index log_auditoria_usuario_idx on public.log_auditoria (usuario_id);

create table public.importacoes (
    id bigint generated always as identity primary key,
    empresa_id bigint not null references public.empresas (id),
    usuario_id uuid not null references public.perfis (id),
    arquivo text not null,
    fichas_criadas integer not null default 0,
    fichas_substituidas integer not null default 0,
    fichas_puladas integer not null default 0,
    insumos_criados integer not null default 0,
    apelidos_criados integer not null default 0,
    criado_em timestamptz not null default now()
);
create index importacoes_empresa_idx on public.importacoes (empresa_id, criado_em desc);
create index importacoes_usuario_idx on public.importacoes (usuario_id);

-- ── Segurança das tabelas novas ────────────────────────────────────────────
revoke all on public.apelidos, public.log_auditoria, public.importacoes from anon;
grant select on public.apelidos, public.log_auditoria, public.importacoes to authenticated;
grant insert, update, delete on public.apelidos to authenticated;
grant insert on public.log_auditoria, public.importacoes to authenticated;

alter table public.apelidos enable row level security;
alter table public.log_auditoria enable row level security;
alter table public.importacoes enable row level security;

create policy apelidos_ler on public.apelidos for select to authenticated
    using (empresa_id = (select public.minha_empresa()));
create policy apelidos_escrever on public.apelidos for all to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()))
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));

create policy importacoes_ler on public.importacoes for select to authenticated
    using (empresa_id = (select public.minha_empresa()));
create policy importacoes_criar on public.importacoes for insert to authenticated
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa())
                and usuario_id = (select auth.uid()));

-- Log: só a gestão lê; só se grava em nome próprio; ninguém altera nem apaga (sem política
-- de update/delete = negado).
create policy log_ler on public.log_auditoria for select to authenticated
    using ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa()));
create policy log_criar on public.log_auditoria for insert to authenticated
    with check ((select public.sou_gestao()) and empresa_id = (select public.minha_empresa())
                and usuario_id = (select auth.uid()));

-- ── Funções internas (schema fora da API: não dá para chamar pelo navegador) ──
create schema if not exists interno;
revoke all on schema interno from public, anon;
grant usage on schema interno to authenticated;

-- Mensagem clara em vez do erro genérico de permissão da RLS.
create function interno.exigir_gestao() returns bigint
language plpgsql stable set search_path = ''
as $$
declare
    v_empresa bigint := public.minha_empresa();
begin
    if v_empresa is null or not public.sou_gestao() then
        raise exception 'Apenas a gestão pode alterar o cadastro.' using errcode = '42501';
    end if;
    return v_empresa;
end;
$$;

create function interno.registrar(p_acao text, p_entidade text, p_entidade_id bigint, p_descricao text)
returns void
language sql set search_path = ''
as $$
    insert into public.log_auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, descricao)
    values (public.minha_empresa(), auth.uid(), p_acao, p_entidade, p_entidade_id, p_descricao);
$$;

-- Erro se a ficha depender dela mesma por algum caminho de sub-receitas.
create function interno.checar_ciclo(p_ficha_id bigint) returns void
language plpgsql stable set search_path = ''
as $$
declare
    v_nome text;
begin
    if exists (
        with recursive alcance (id) as (
            select fi.sub_ficha_id from public.ficha_itens fi
            where fi.ficha_id = p_ficha_id and fi.sub_ficha_id is not null
            union
            select fi.sub_ficha_id from public.ficha_itens fi
            join alcance a on fi.ficha_id = a.id
            where fi.sub_ficha_id is not null
        )
        select 1 from alcance where id = p_ficha_id
    ) then
        select nome into v_nome from public.fichas where id = p_ficha_id;
        raise exception 'A ficha "%" usaria ela mesma como sub-receita (referência circular).', v_nome
            using errcode = '23514';
    end if;
end;
$$;

-- Substitui itens, passos e alérgenos de uma ficha pelo conteúdo enviado.
-- p: { itens: [{insumo_id | sub_ficha_id, quantidade, unidade_sub, observacao}],
--      passos: [{descricao, tempo_min}], alergeno_ids: [..] }
create function interno.gravar_conteudo_ficha(p_ficha_id bigint, p jsonb) returns void
language plpgsql set search_path = ''
as $$
begin
    delete from public.ficha_itens where ficha_id = p_ficha_id;
    delete from public.passos where ficha_id = p_ficha_id;
    delete from public.ficha_alergenos where ficha_id = p_ficha_id;

    insert into public.ficha_itens (ficha_id, ordem, insumo_id, sub_ficha_id, quantidade, unidade_sub, observacao)
    select p_ficha_id, (e.ordem - 1)::int,
           (e.item ->> 'insumo_id')::bigint,
           (e.item ->> 'sub_ficha_id')::bigint,
           coalesce((e.item ->> 'quantidade')::numeric, 0),
           case when e.item ->> 'sub_ficha_id' is not null then coalesce(nullif(e.item ->> 'unidade_sub', ''), 'g') end,
           nullif(trim(e.item ->> 'observacao'), '')
    from jsonb_array_elements(coalesce(p -> 'itens', '[]')) with ordinality as e (item, ordem);

    insert into public.passos (ficha_id, ordem, descricao, tempo_min)
    select p_ficha_id, (e.ordem - 1)::int, trim(e.passo ->> 'descricao'), (e.passo ->> 'tempo_min')::int
    from jsonb_array_elements(coalesce(p -> 'passos', '[]')) with ordinality as e (passo, ordem)
    where trim(coalesce(e.passo ->> 'descricao', '')) <> '';

    insert into public.ficha_alergenos (ficha_id, alergeno_id)
    select distinct p_ficha_id, a::bigint
    from jsonb_array_elements_text(coalesce(p -> 'alergeno_ids', '[]')) as a;
end;
$$;

grant execute on all functions in schema interno to authenticated;

-- ── Categorias ─────────────────────────────────────────────────────────────
-- p: { id?, tipo: 'ficha'|'insumo', nome }
create function public.salvar_categoria(p jsonb) returns bigint
language plpgsql set search_path = ''
as $$
declare
    v_empresa bigint := interno.exigir_gestao();
    v_id bigint := (p ->> 'id')::bigint;
    v_nome text := trim(coalesce(p ->> 'nome', ''));
    v_antigo text;
begin
    if v_nome = '' then
        raise exception 'Informe o nome da categoria.' using errcode = '23514';
    end if;
    if v_id is null then
        insert into public.categorias (empresa_id, tipo, nome) values (v_empresa, p ->> 'tipo', v_nome)
        returning id into v_id;
        perform interno.registrar('criar', 'categoria', v_id, format('Criou a categoria de %s "%s"', p ->> 'tipo', v_nome));
    else
        select nome into v_antigo from public.categorias where id = v_id;
        update public.categorias set nome = v_nome where id = v_id;
        if not found then
            raise exception 'Categoria não encontrada.' using errcode = 'P0002';
        end if;
        perform interno.registrar('editar', 'categoria', v_id, format('Renomeou a categoria "%s" para "%s"', v_antigo, v_nome));
    end if;
    return v_id;
exception when unique_violation then
    raise exception 'Já existe uma categoria com o nome "%".', v_nome using errcode = '23505';
end;
$$;

create function public.excluir_categoria(p_id bigint) returns void
language plpgsql set search_path = ''
as $$
declare
    v_nome text;
begin
    perform interno.exigir_gestao();
    delete from public.categorias where id = p_id returning nome into v_nome;
    if v_nome is null then
        raise exception 'Categoria não encontrada.' using errcode = 'P0002';
    end if;
    perform interno.registrar('excluir', 'categoria', p_id, format('Excluiu a categoria "%s"', v_nome));
end;
$$;

-- ── Insumos ────────────────────────────────────────────────────────────────
-- p: { id?, nome, unidade, categoria_id }
create function public.salvar_insumo(p jsonb) returns bigint
language plpgsql set search_path = ''
as $$
declare
    v_empresa bigint := interno.exigir_gestao();
    v_id bigint := (p ->> 'id')::bigint;
    v_nome text := trim(coalesce(p ->> 'nome', ''));
    v_antes text;
begin
    if v_nome = '' then
        raise exception 'Informe o nome do insumo.' using errcode = '23514';
    end if;
    if exists (select 1 from public.insumos
               where empresa_id = v_empresa and lower(nome) = lower(v_nome) and id is distinct from v_id) then
        raise exception 'Já existe um insumo com o nome "%".', v_nome using errcode = '23505';
    end if;
    if v_id is null then
        insert into public.insumos (empresa_id, nome, unidade, categoria_id)
        values (v_empresa, v_nome, p ->> 'unidade', (p ->> 'categoria_id')::bigint)
        returning id into v_id;
        perform interno.registrar('criar', 'insumo', v_id, format('Criou o insumo "%s" (%s)', v_nome, p ->> 'unidade'));
    else
        select format('"%s" (%s)', nome, unidade) into v_antes from public.insumos where id = v_id;
        update public.insumos
        set nome = v_nome, unidade = p ->> 'unidade', categoria_id = (p ->> 'categoria_id')::bigint
        where id = v_id;
        if not found then
            raise exception 'Insumo não encontrado.' using errcode = 'P0002';
        end if;
        perform interno.registrar('editar', 'insumo', v_id,
            format('Editou o insumo %s → "%s" (%s)', v_antes, v_nome, p ->> 'unidade'));
    end if;
    return v_id;
end;
$$;

create function public.mudar_categoria_insumos(p_ids bigint[], p_categoria_id bigint) returns integer
language plpgsql set search_path = ''
as $$
declare
    v_qtd integer;
    v_cat text;
begin
    perform interno.exigir_gestao();
    update public.insumos set categoria_id = p_categoria_id where id = any (p_ids);
    get diagnostics v_qtd = row_count;
    select nome into v_cat from public.categorias where id = p_categoria_id;
    perform interno.registrar('editar', 'insumo', null,
        format('Mudou %s insumo(s) para a categoria "%s"', v_qtd, coalesce(v_cat, 'Sem categoria')));
    return v_qtd;
end;
$$;

-- p_linhas: [{ nome, unidade, categoria }] (planilha modelo). Pula nomes que já existem.
create function public.importar_insumos(p_linhas jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
    v_empresa bigint := interno.exigir_gestao();
    v_linha jsonb;
    v_nome text;
    v_cat_nome text;
    v_cat_id bigint;
    v_criados integer := 0;
    v_ignorados integer := 0;
    v_cats_novas text[] := '{}';
begin
    for v_linha in select * from jsonb_array_elements(coalesce(p_linhas, '[]')) loop
        v_nome := trim(coalesce(v_linha ->> 'nome', ''));
        if v_nome = '' or exists (select 1 from public.insumos where empresa_id = v_empresa and lower(nome) = lower(v_nome)) then
            v_ignorados := v_ignorados + 1;
            continue;
        end if;
        v_cat_id := null;
        v_cat_nome := nullif(trim(coalesce(v_linha ->> 'categoria', '')), '');
        if v_cat_nome is not null then
            select id into v_cat_id from public.categorias
            where empresa_id = v_empresa and tipo = 'insumo' and lower(nome) = lower(v_cat_nome);
            if v_cat_id is null then
                insert into public.categorias (empresa_id, tipo, nome) values (v_empresa, 'insumo', v_cat_nome)
                returning id into v_cat_id;
                v_cats_novas := v_cats_novas || v_cat_nome;
            end if;
        end if;
        insert into public.insumos (empresa_id, nome, unidade, categoria_id)
        values (v_empresa, v_nome, coalesce(nullif(v_linha ->> 'unidade', ''), 'un'), v_cat_id);
        v_criados := v_criados + 1;
    end loop;
    perform interno.registrar('importar', 'insumo', null,
        format('Importou planilha de insumos: %s criado(s), %s ignorado(s)', v_criados, v_ignorados));
    return jsonb_build_object('criados', v_criados, 'ignorados', v_ignorados, 'categorias_criadas', to_jsonb(v_cats_novas));
end;
$$;

-- ── Fichas ─────────────────────────────────────────────────────────────────
-- p: { id?, nome, categoria_id, rendimento_qtd, rendimento_unidade, observacoes,
--      validade_congelado_dias, validade_refrigerado_dias, validade_ambiente_dias,
--      itens, passos, alergeno_ids }  (itens/passos/alergeno_ids: ver gravar_conteudo_ficha)
create function public.salvar_ficha(p jsonb) returns bigint
language plpgsql set search_path = ''
as $$
declare
    v_empresa bigint := interno.exigir_gestao();
    v_id bigint := (p ->> 'id')::bigint;
    v_nome text := trim(coalesce(p ->> 'nome', ''));
begin
    if v_nome = '' then
        raise exception 'Informe o nome da ficha.' using errcode = '23514';
    end if;
    if exists (select 1 from public.fichas
               where empresa_id = v_empresa and lower(nome) = lower(v_nome) and id is distinct from v_id) then
        raise exception 'Já existe uma ficha com o nome "%".', v_nome using errcode = '23505';
    end if;

    if v_id is null then
        insert into public.fichas (empresa_id, nome, categoria_id, rendimento_qtd, rendimento_unidade, observacoes,
                                   validade_congelado_dias, validade_refrigerado_dias, validade_ambiente_dias)
        values (v_empresa, v_nome, (p ->> 'categoria_id')::bigint, (p ->> 'rendimento_qtd')::numeric,
                coalesce(p ->> 'rendimento_unidade', 'g'), nullif(trim(p ->> 'observacoes'), ''),
                (p ->> 'validade_congelado_dias')::int, (p ->> 'validade_refrigerado_dias')::int,
                (p ->> 'validade_ambiente_dias')::int)
        returning id into v_id;
    else
        update public.fichas set
            nome = v_nome,
            categoria_id = (p ->> 'categoria_id')::bigint,
            rendimento_qtd = (p ->> 'rendimento_qtd')::numeric,
            rendimento_unidade = coalesce(p ->> 'rendimento_unidade', 'g'),
            observacoes = nullif(trim(p ->> 'observacoes'), ''),
            validade_congelado_dias = (p ->> 'validade_congelado_dias')::int,
            validade_refrigerado_dias = (p ->> 'validade_refrigerado_dias')::int,
            validade_ambiente_dias = (p ->> 'validade_ambiente_dias')::int
        where id = v_id;
        if not found then
            raise exception 'Ficha não encontrada.' using errcode = 'P0002';
        end if;
    end if;

    perform interno.gravar_conteudo_ficha(v_id, p);
    perform interno.checar_ciclo(v_id);
    perform interno.registrar(case when p ->> 'id' is null then 'criar' else 'editar' end, 'ficha', v_id,
        format('%s a ficha "%s"', case when p ->> 'id' is null then 'Criou' else 'Editou' end, v_nome));
    return v_id;
end;
$$;

create function public.definir_ficha_ativa(p_id bigint, p_ativa boolean) returns void
language plpgsql set search_path = ''
as $$
declare
    v_nome text;
begin
    perform interno.exigir_gestao();
    update public.fichas set ativa = p_ativa where id = p_id returning nome into v_nome;
    if v_nome is null then
        raise exception 'Ficha não encontrada.' using errcode = 'P0002';
    end if;
    perform interno.registrar(case when p_ativa then 'reativar' else 'inativar' end, 'ficha', p_id,
        format('%s a ficha "%s"', case when p_ativa then 'Reativou' else 'Inativou' end, v_nome));
end;
$$;

create function public.verificar_ficha(p_id bigint) returns void
language plpgsql set search_path = ''
as $$
declare
    v_nome text;
begin
    perform interno.exigir_gestao();
    update public.fichas set verificada = true, verificada_em = now(), verificada_por = auth.uid()
    where id = p_id returning nome into v_nome;
    if v_nome is null then
        raise exception 'Ficha não encontrada.' using errcode = 'P0002';
    end if;
    perform interno.registrar('verificar', 'ficha', p_id, format('Marcou a ficha "%s" como verificada', v_nome));
end;
$$;

-- ── Importação da planilha do chef ────────────────────────────────────────
-- Aplica a prévia confirmada na tela. Referências ("ref") ligam o que ainda não tem id:
-- p: {
--   arquivo, puladas,
--   novos_insumos: [{ ref, nome, unidade, categoria_id }],
--   fichas: [{ ref, id? (substituir), nome, categoria_id, rendimento_qtd, rendimento_unidade,
--              observacoes, validade_*, alergeno_ids, passos,
--              itens: [{ insumo_id | insumo_ref | sub_ficha_id | sub_ficha_ref, quantidade,
--                        unidade_sub, observacao }] }],
--   apelidos: [{ chave, insumo_id | insumo_ref | ficha_id | ficha_ref }]
-- }
create function public.importar_planilha(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
    v_empresa bigint := interno.exigir_gestao();
    v_insumos jsonb := '{}';   -- ref -> id
    v_fichas jsonb := '{}';    -- ref -> id
    v_item jsonb;
    v_ficha jsonb;
    v_apelido jsonb;
    v_id bigint;
    v_criadas integer := 0;
    v_substituidas integer := 0;
    v_apelidos integer := 0;
    v_novos integer := 0;
    v_itens jsonb;
begin
    -- 1. Insumos novos
    for v_item in select * from jsonb_array_elements(coalesce(p -> 'novos_insumos', '[]')) loop
        insert into public.insumos (empresa_id, nome, unidade, categoria_id)
        values (v_empresa, trim(v_item ->> 'nome'), coalesce(v_item ->> 'unidade', 'g'), (v_item ->> 'categoria_id')::bigint)
        returning id into v_id;
        v_insumos := v_insumos || jsonb_build_object(v_item ->> 'ref', v_id);
        v_novos := v_novos + 1;
    end loop;

    -- 2. Fichas (só os dados), para todas terem id antes dos itens (sub-receita da mesma planilha)
    for v_ficha in select * from jsonb_array_elements(coalesce(p -> 'fichas', '[]')) loop
        if exists (select 1 from public.fichas where empresa_id = v_empresa
                   and lower(nome) = lower(trim(v_ficha ->> 'nome')) and id is distinct from (v_ficha ->> 'id')::bigint) then
            raise exception 'Já existe uma ficha com o nome "%".', trim(v_ficha ->> 'nome') using errcode = '23505';
        end if;
        if v_ficha ->> 'id' is null then
            insert into public.fichas (empresa_id, nome, rendimento_qtd) values (v_empresa, trim(v_ficha ->> 'nome'), 1)
            returning id into v_id;
            v_criadas := v_criadas + 1;
        else
            v_id := (v_ficha ->> 'id')::bigint;
            v_substituidas := v_substituidas + 1;
        end if;
        update public.fichas set
            nome = trim(v_ficha ->> 'nome'),
            categoria_id = (v_ficha ->> 'categoria_id')::bigint,
            rendimento_qtd = (v_ficha ->> 'rendimento_qtd')::numeric,
            rendimento_unidade = coalesce(v_ficha ->> 'rendimento_unidade', 'g'),
            observacoes = nullif(trim(v_ficha ->> 'observacoes'), ''),
            validade_congelado_dias = (v_ficha ->> 'validade_congelado_dias')::int,
            validade_refrigerado_dias = (v_ficha ->> 'validade_refrigerado_dias')::int,
            validade_ambiente_dias = (v_ficha ->> 'validade_ambiente_dias')::int
        where id = v_id;
        if not found then
            raise exception 'Ficha a substituir não encontrada.' using errcode = 'P0002';
        end if;
        v_fichas := v_fichas || jsonb_build_object(v_ficha ->> 'ref', v_id);
    end loop;

    -- 3. Conteúdo de cada ficha, trocando refs por ids
    for v_ficha in select * from jsonb_array_elements(coalesce(p -> 'fichas', '[]')) loop
        v_id := (v_fichas ->> (v_ficha ->> 'ref'))::bigint;
        select coalesce(jsonb_agg(
                   (i - 'insumo_ref' - 'sub_ficha_ref')
                   || jsonb_build_object(
                        -- nullif: um "insumo_id": null vindo da tela é JSON null (não SQL null) e
                        -- faria o coalesce ignorar a referência ao insumo novo.
                        'insumo_id', coalesce(nullif(i -> 'insumo_id', 'null'), v_insumos -> (i ->> 'insumo_ref')),
                        'sub_ficha_id', coalesce(nullif(i -> 'sub_ficha_id', 'null'), v_fichas -> (i ->> 'sub_ficha_ref')))
                   order by o), '[]')
        into v_itens
        from jsonb_array_elements(coalesce(v_ficha -> 'itens', '[]')) with ordinality as e (i, o);
        perform interno.gravar_conteudo_ficha(v_id, v_ficha || jsonb_build_object('itens', v_itens));
    end loop;
    for v_id in select value::bigint from jsonb_each_text(v_fichas) loop
        perform interno.checar_ciclo(v_id);
    end loop;

    -- 4. Apelidos aprendidos (o mais recente vence)
    for v_apelido in select * from jsonb_array_elements(coalesce(p -> 'apelidos', '[]')) loop
        insert into public.apelidos (empresa_id, chave, insumo_id, ficha_id)
        values (v_empresa, v_apelido ->> 'chave',
                coalesce((v_apelido ->> 'insumo_id')::bigint, (v_insumos ->> (v_apelido ->> 'insumo_ref'))::bigint),
                coalesce((v_apelido ->> 'ficha_id')::bigint, (v_fichas ->> (v_apelido ->> 'ficha_ref'))::bigint))
        on conflict (empresa_id, chave) do update set insumo_id = excluded.insumo_id, ficha_id = excluded.ficha_id;
        v_apelidos := v_apelidos + 1;
    end loop;

    insert into public.importacoes (empresa_id, usuario_id, arquivo, fichas_criadas, fichas_substituidas,
                                    fichas_puladas, insumos_criados, apelidos_criados)
    values (v_empresa, auth.uid(), coalesce(p ->> 'arquivo', '(sem nome)'), v_criadas, v_substituidas,
            coalesce((p ->> 'puladas')::int, 0), v_novos, v_apelidos);
    perform interno.registrar('importar', 'planilha', null,
        format('Importou "%s": %s ficha(s) criada(s), %s substituída(s), %s insumo(s) novo(s)',
               coalesce(p ->> 'arquivo', '(sem nome)'), v_criadas, v_substituidas, v_novos));

    return jsonb_build_object('fichas_criadas', v_criadas, 'fichas_substituidas', v_substituidas,
        'fichas_puladas', coalesce((p ->> 'puladas')::int, 0), 'insumos_criados', v_novos,
        'apelidos_criados', v_apelidos, 'fichas', v_fichas);
exception when unique_violation then
    raise exception 'Conflito de nome ao importar (ficha ou insumo repetido): %', sqlerrm using errcode = '23505';
end;
$$;

-- Só usuários logados executam as RPCs (a própria função e a RLS decidem o resto).
revoke execute on function
    public.salvar_categoria(jsonb), public.excluir_categoria(bigint), public.salvar_insumo(jsonb),
    public.mudar_categoria_insumos(bigint[], bigint), public.importar_insumos(jsonb), public.salvar_ficha(jsonb),
    public.definir_ficha_ativa(bigint, boolean), public.verificar_ficha(bigint), public.importar_planilha(jsonb)
from public, anon;
grant execute on function
    public.salvar_categoria(jsonb), public.excluir_categoria(bigint), public.salvar_insumo(jsonb),
    public.mudar_categoria_insumos(bigint[], bigint), public.importar_insumos(jsonb), public.salvar_ficha(jsonb),
    public.definir_ficha_ativa(bigint, boolean), public.verificar_ficha(bigint), public.importar_planilha(jsonb)
to authenticated;
