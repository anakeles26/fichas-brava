# FichaBase

Sistema de **fichas técnicas de cozinha**: cadastro de insumos, fichas com
ingredientes, sub-receitas, modo de preparo, alérgenos, foto e impressão, mais
o controle de usuários e a trilha de auditoria.

Um sistema por empresa (ou uma empresa com várias unidades), pensado para
restaurantes: quem cozinha consulta a ficha pronta e a gerência controla o
cadastro.

## O que o app tem

| Tela | Para que serve |
|---|---|
| **Dashboard** | Quantas fichas ativas e quantos insumos a empresa tem |
| **Fichas Técnicas** | Lista com busca e filtros, criação, detalhe com ingredientes, preparo, validade, alérgenos e foto, cálculo por multiplicador e impressão (térmica 80/58 mm e A4) |
| **Insumos** | Cadastro manual ou por planilha (Excel), com unidade e categoria |
| **Categorias** | Categorias de insumo (estoque) e de ficha (cardápio) |
| **Alérgenos** | Catálogo usado nas fichas |
| **Usuários** | Criação e edição, com 4 papéis: admin master, admin, líder e usuário |
| **Auditoria e Logs** | Quem criou, editou ou removeu o quê |
| **Log de acessos** | Quem entrou no sistema, quando e de qual unidade |

Várias unidades (empresas) convivem no mesmo banco: cada pessoa enxerga só a
sua, e o admin master troca de unidade num seletor na barra lateral.

## Instalação

### 1. Ambiente

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

### 2. Banco no Supabase

1. Crie um projeto novo em [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: cole e rode `sql/01_schema.sql` (cria as tabelas).
3. Rode `sql/02_role_app.sql` — ele cria a role `fichabase_app`, que é a
   conexão do app. **Troque a senha no topo do arquivo antes de rodar.**
4. Rode `sql/rls_policies.sql` — a segurança por empresa, que impede uma
   unidade de enxergar os dados da outra mesmo que uma consulta esqueça o
   filtro.

> A role `postgres` do Supabase ignora essas regras (tem BYPASSRLS). Use
> sempre a `fichabase_app` na conexão do app.

### 3. Configuração

Copie `.env.example` para `.env` e preencha:

```
DATABASE_URL=postgresql+psycopg://fichabase_app:SENHA@HOST:5432/postgres
AUTH_COOKIE_KEY=uma-frase-longa-e-aleatoria
```

O `DATABASE_URL` sai do Supabase em **Connect → Connection string**, trocando
o usuário e a senha pelos da role criada no passo 2.

### 4. Primeiro acesso

```bash
.venv\Scripts\python -m fichabase.seed
```

O script cria a empresa, o catálogo de alérgenos e pede nome, e-mail e senha
do **admin master**, que é quem cadastra os demais usuários depois.

### 5. Rodar

```bash
.venv\Scripts\streamlit run app.py
```

Para publicar, o caminho mais simples é o [Streamlit Community
Cloud](https://share.streamlit.io): aponte para este repositório e cadastre
`DATABASE_URL` e `AUTH_COOKIE_KEY` em **Secrets**.

## Personalização

- **Nome do app:** `MARCA` em `src/fichabase/ui.py` (o título mostra
  "Ficha" + a marca).
- **Cores:** `.streamlit/config.toml` e as constantes `VERDE`/`DOURADO` em
  `src/fichabase/ui.py`.
- **Fotos das fichas:** por padrão ficam no banco; para usar o Storage do
  Supabase, veja `src/fichabase/storage.py`.

## Mudanças no banco

O schema é versionado com Alembic:

```bash
.venv\Scripts\alembic revision --autogenerate -m "o que mudou"
.venv\Scripts\alembic upgrade head
```

No Supabase, gere o SQL e rode no SQL Editor:

```bash
.venv\Scripts\alembic upgrade <versão anterior>:<nova> --sql
```
