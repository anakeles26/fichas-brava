-- Fichas Brava — tabelas.
-- Toda tabela operacional carrega a casa (empresa_id), mesmo que hoje só exista o
-- Brava Wine: assim outra casa do grupo entra sem refazer o banco. As regras de quem
-- vê e quem edita ficam em 20260929000002_rls.sql.

create table public.empresas (
    id bigint generated always as identity primary key,
    nome text not null unique,
    slug text not null unique
);

-- Um perfil por login do Supabase Auth: diz de qual casa a pessoa é e o que pode fazer.
-- gestao = lê e edita; cozinha = só lê (login compartilhado da cozinha).
create table public.perfis (
    id uuid primary key references auth.users (id) on delete cascade,
    empresa_id bigint not null references public.empresas (id),
    nome text not null,
    papel text not null check (papel in ('gestao', 'cozinha')),
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);

create table public.categorias (
    id bigint generated always as identity primary key,
    empresa_id bigint not null references public.empresas (id),
    tipo text not null check (tipo in ('ficha', 'insumo')),
    nome text not null,
    unique (empresa_id, tipo, nome)
);

create table public.insumos (
    id bigint generated always as identity primary key,
    empresa_id bigint not null references public.empresas (id),
    nome text not null,
    unidade text not null check (unidade in ('g', 'kg', 'ml', 'l', 'un', 'pc')),
    categoria_id bigint references public.categorias (id) on delete set null,
    unique (empresa_id, nome)
);

create table public.fichas (
    id bigint generated always as identity primary key,
    empresa_id bigint not null references public.empresas (id),
    nome text not null,
    categoria_id bigint references public.categorias (id) on delete set null,
    rendimento_qtd numeric(12, 3) not null default 1 check (rendimento_qtd > 0),
    rendimento_unidade text not null default 'un'
        check (rendimento_unidade in ('g', 'kg', 'ml', 'l', 'un', 'pc')),
    observacoes text,
    -- Validade em dias por forma de armazenamento; vazio = não se aplica.
    validade_congelado_dias integer check (validade_congelado_dias >= 0),
    validade_refrigerado_dias integer check (validade_refrigerado_dias >= 0),
    validade_ambiente_dias integer check (validade_ambiente_dias >= 0),
    verificada boolean not null default false,
    -- Inativar em vez de excluir: a ficha pode ser sub-receita de outras.
    ativa boolean not null default true,
    criado_em timestamptz not null default now(),
    unique (empresa_id, nome)
);

-- Ingrediente de uma ficha: um insumo OU outra ficha (sub-receita), nunca os dois.
create table public.ficha_itens (
    id bigint generated always as identity primary key,
    ficha_id bigint not null references public.fichas (id) on delete cascade,
    ordem integer not null,
    insumo_id bigint references public.insumos (id),
    sub_ficha_id bigint references public.fichas (id),
    quantidade numeric(12, 4) not null check (quantidade >= 0),
    -- Só para sub-receita (o insumo já tem a própria unidade).
    unidade_sub text check (unidade_sub in ('g', 'kg', 'ml', 'l', 'un', 'pc')),
    observacao text,
    constraint ficha_itens_um_tipo check ((insumo_id is not null) <> (sub_ficha_id is not null)),
    constraint ficha_itens_unidade_sub check ((sub_ficha_id is null) = (unidade_sub is null)),
    constraint ficha_itens_nao_e_ela_mesma check (sub_ficha_id is distinct from ficha_id)
);
create index ficha_itens_ficha_idx on public.ficha_itens (ficha_id, ordem);
create index ficha_itens_sub_ficha_idx on public.ficha_itens (sub_ficha_id);
create index ficha_itens_insumo_idx on public.ficha_itens (insumo_id);

create table public.passos (
    id bigint generated always as identity primary key,
    ficha_id bigint not null references public.fichas (id) on delete cascade,
    ordem integer not null,
    descricao text not null,
    tempo_min integer check (tempo_min >= 0)
);
create index passos_ficha_idx on public.passos (ficha_id, ordem);

-- Catálogo global (igual para todas as casas, como nos rótulos de alimentos).
create table public.alergenos (
    id bigint generated always as identity primary key,
    nome text not null unique,
    icone text,
    descricao text
);

create table public.ficha_alergenos (
    ficha_id bigint not null references public.fichas (id) on delete cascade,
    alergeno_id bigint not null references public.alergenos (id) on delete cascade,
    primary key (ficha_id, alergeno_id)
);
create index ficha_alergenos_alergeno_idx on public.ficha_alergenos (alergeno_id);

create index perfis_empresa_idx on public.perfis (empresa_id);
create index categorias_empresa_idx on public.categorias (empresa_id);
create index insumos_categoria_idx on public.insumos (categoria_id);
create index fichas_categoria_idx on public.fichas (categoria_id);
