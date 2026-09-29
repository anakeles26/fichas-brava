# Plano — Entrega 1 (Consulta) do Fichas Brava na Vercel

Design: `docs/superpowers/specs/2026-09-29-fichas-brava-vercel-design.md`

Ambiente disponível: Node 24 / npm 11. Sem Docker, Supabase CLI ou psql → as regras de
segurança são testadas com **PGlite** (Postgres em WebAssembly, via npm), com um esquema
`auth` mínimo que imita o do Supabase (`auth.users`, `auth.uid()`, papéis `anon` e
`authenticated`).

Ordem pensada para que tudo que não depende das contas da Ana (Supabase e Vercel) fique
pronto e testado primeiro.

## Etapa 1 — Banco (sem depender do Supabase)

1. `supabase/migrations/20260929000001_schema.sql` — tabelas, restrições e índices da seção 4
   do design.
2. `supabase/migrations/20260929000002_rls.sql` — funções `minha_empresa()` e `sou_gestao()`,
   `enable row level security` e políticas por tabela, `grant`s para `authenticated`.
3. `supabase/tests/` — harness PGlite: cria o esquema `auth` simulado, aplica as migrações em
   ordem e roda os cenários (Vitest):
   - cozinha lê fichas da própria casa; não consegue insert/update/delete em nenhuma tabela;
   - gestão consegue insert/update na própria casa e não na outra;
   - usuário de outra casa não vê fichas do Brava;
   - `anon` não vê nada; perfil inativo não vê nada;
   - item com insumo **e** sub-ficha (ou nenhum dos dois) é recusado.

**Pronto quando:** `npm test` em `supabase/` passa.

## Etapa 2 — Regras de cálculo (TypeScript puro)

1. Criar o app: `web/` com create-next-app (TypeScript, App Router, Tailwind, ESLint, `src/`).
2. `web/src/lib/quantidades.ts` — porte de `receitas.py`: `unidadeDeExibicao`,
   `formatarNumero`, `formatarQuantidade`, `converterUnidade`.
3. `web/src/lib/composicao.ts` — monta a árvore de itens (sub-receitas) a partir de dados
   simples, com fator, proteção contra ciclo, sem-rendimento e unidade incompatível.
4. `web/src/lib/busca.ts` — normalização sem acento/maiúsculas.
5. Testes Vitest para os três.

**Pronto quando:** `npm test` em `web/` passa.

## Etapa 3 — Telas

1. Supabase no Next: `@supabase/ssr` (cliente de servidor com cookies, cliente de navegador,
   middleware que renova sessão e redireciona para `/login` guardando a página de origem).
2. Tema: cores da Brava no Tailwind, logo em `web/public/`, layout com menu (logo, Fichas,
   Trocar senha, Sair).
3. `/login` (Server Action com `signInWithPassword`), `/conta/senha` (`updateUser`), sair.
4. `/fichas`: consulta no servidor + busca/filtro no navegador (43 fichas, leve).
5. `/fichas/[id]`: carrega ficha, itens e sub-fichas por nível; multiplicador em componente
   de cliente; ingredientes com "ver composição"; preparo; observações em Markdown seguro;
   `not-found` e `error` da rota.
6. `npm run build` e `npm run lint` sem erros.

## Etapa 4 — Migração (Python)

1. `scripts/migrar_para_supabase.py`: lê o SQLite, grava no Postgres do Supabase (psycopg,
   transação única, apaga e regrava os dados de fichas do Brava), cria usuários pelo Admin
   API, grava senhas provisórias em `ACESSO_SUPABASE.txt` (gitignored).
2. Ao final, confere as contagens SQLite × Supabase e imprime o resultado.

## Etapa 5 — Publicação (precisa das contas da Ana)

1. Ana cria o projeto no Supabase → aplicar as migrações (SQL Editor ou conexão direta).
2. Rodar a migração de dados e conferir as contagens.
3. Ana cria a Vercel e importa o repositório com Root Directory `web`; cadastrar
   `NEXT_PUBLIC_SUPABASE_URL` e a chave pública.
4. Conferir no navegador (celular e computador) com os logins de cozinha e gestão.
5. Checar os critérios de pronto da seção 9 do design.

Cada etapa termina com commit.
