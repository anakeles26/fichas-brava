-- Fichas Brava — apelidos separados por tipo: "ingrediente" (nome de um item na lista de
-- ingredientes → insumo ou sub-receita) e "prato" (nome do produto da aba → ficha).
--
-- Por quê: a mesma palavra pode ter os dois papéis. Na planilha do Executivo 1, "ABACAXI" é
-- o prato da aba ABACAXI (cadastrado como "Abacaxi caramelizado") e também o ingrediente
-- (a fruta) dessa mesma ficha e da Delícia de abacaxi. Com um apelido só, o ingrediente
-- passava a apontar para a ficha — e a ficha usaria ela mesma como sub-receita.

alter table public.apelidos
    add column tipo text not null default 'ingrediente' check (tipo in ('ingrediente', 'prato'));

alter table public.apelidos drop constraint apelidos_empresa_id_chave_key;
alter table public.apelidos add constraint apelidos_empresa_tipo_chave_key unique (empresa_id, tipo, chave);

-- Apelido de prato só aponta para ficha.
alter table public.apelidos
    add constraint apelidos_prato_e_ficha check (tipo = 'ingrediente' or ficha_id is not null);

-- Os apelidos criados pela migração 20260930000004 são de prato.
update public.apelidos a
set tipo = 'prato'
from public.empresas e
where e.id = a.empresa_id and e.slug = 'brava-wine' and a.ficha_id is not null
  and a.chave in (
    'ABACAXI', 'BAVETE AO MOLHO DE QUEIJO SALMAO', 'BERINGELA GRATINADA', 'BRUSQUETA DE COGUMELOS',
    'CAMARA A BEURRE BLANC', 'CAMARAO A BEURRE BLANC', 'CROQUETE DE OSSO BUCO', 'FILE MIGNON AO POAVRE',
    'FILE MINGNO COM RISOTO DE COGUMELOS', 'FILE TORNEDOR AO MOLHO POAVRE', 'NHOQUE DE BANANA DA TERRA',
    'PANACOTA DE CASTANHA COM ACAI', 'RAVIOLE DE ESPINAFRE COM RICOTA', 'RAVIOLE MEDIT SECCH',
    'RIGATONI AO POLMODORO', 'SALMAO AO MOLHO DE MARACUJA E RISOTO SICILIANO', 'SIRIGADO NA CROSTA DE ERVAS'
  );

-- importar_planilha passa a gravar o tipo de cada apelido aprendido.
create or replace function public.importar_planilha(p jsonb) returns jsonb
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

    -- 4. Apelidos aprendidos (o mais recente vence), cada um no seu tipo
    for v_apelido in select * from jsonb_array_elements(coalesce(p -> 'apelidos', '[]')) loop
        insert into public.apelidos (empresa_id, tipo, chave, insumo_id, ficha_id)
        values (v_empresa, coalesce(v_apelido ->> 'tipo', 'ingrediente'), v_apelido ->> 'chave',
                coalesce((v_apelido ->> 'insumo_id')::bigint, (v_insumos ->> (v_apelido ->> 'insumo_ref'))::bigint),
                coalesce((v_apelido ->> 'ficha_id')::bigint, (v_fichas ->> (v_apelido ->> 'ficha_ref'))::bigint))
        on conflict (empresa_id, tipo, chave) do update set insumo_id = excluded.insumo_id, ficha_id = excluded.ficha_id;
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
