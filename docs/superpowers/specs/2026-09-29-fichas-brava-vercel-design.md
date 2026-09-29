# Fichas Brava na Vercel — Design

**Data:** 29/09/2026
**Status:** aprovado em conversa; aguardando revisão do documento
**Escopo deste documento:** visão das 4 entregas + design detalhado da **Entrega 1 (Consulta)**

## 1. Contexto e objetivo

O Fichas Brava hoje é um app Streamlit + SQLAlchemy rodando localmente, com banco SQLite
(43 fichas, 140 insumos, já com as correções confirmadas pelo chef). O objetivo é publicá-lo
na **Vercel**. Como a Vercel não mantém servidores Streamlit (precisa de processo contínuo
com WebSocket), o app será **reescrito em Next.js**, com banco, login e regras de segurança
no **Supabase**.

A reescrita é dividida em entregas, cada uma publicada e utilizável:

| Entrega | Conteúdo | Resultado |
|---|---|---|
| **1. Consulta** | Login, lista de fichas, ficha completa, multiplicador, sub-receitas, migração dos dados | Cozinha consulta pelo celular |
| 2. Cadastro | Criar/editar fichas, insumos e categorias; marcar ficha como verificada | Gestão deixa de depender das planilhas e do Streamlit |
| 3. Gestão | Usuários e papéis pela tela, alérgenos, auditoria, log de acessos | Controle de quem faz o quê |
| 4. Extras | Impressão (térmica 80/58 mm e A4), fotos das fichas | Paridade com o app atual |

Cada entrega de 2 a 4 terá seu próprio design antes de ser implementada.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Público e aparelho | Cozinha **e** gestão, com o mesmo peso → app responsivo (celular, tablet e computador) |
| Login | **Um login compartilhado da cozinha**, só leitura; gestão (Ana e chef) com login próprio |
| Casas | Só o Brava Wine nas telas, mas **banco preparado para várias casas** (cada registro com a sua casa) |
| Arquitetura | Next.js na Vercel + Supabase completo (Auth, Postgres, RLS) |
| Linguagem | App em TypeScript; scripts de importação/migração continuam em Python |

## 3. Arquitetura

```
Navegador (celular / computador)
        │  HTTPS
        ▼
Next.js na Vercel  (App Router, Server Components)
        │  supabase-js com a sessão do usuário (cookie)
        ▼
Supabase: Auth (login) + Postgres com RLS (regras por casa e por papel)
        ▲
        │  chave secreta (só no computador local)
scripts/migrar_para_supabase.py  ←  fichas_brava.db (SQLite atual)
```

- As páginas buscam os dados **no servidor** com a sessão do usuário; o navegador recebe a
  página pronta.
- Toda permissão é garantida no banco (RLS). As telas escondem o que não se aplica, mas
  não são a barreira de segurança.
- A chave secreta do Supabase (service role) **nunca** vai para a Vercel nem para o git.
  Na Vercel ficam só `NEXT_PUBLIC_SUPABASE_URL` e a chave pública (`anon`/publishable).

### Organização do repositório

```
fichas-brava/
├── web/          app Next.js (raiz do projeto na Vercel)
├── supabase/     migrações SQL (tabelas, funções, RLS) e testes de RLS
├── scripts/      Python: importar planilhas (existente) e migrar para o Supabase (novo)
└── app Streamlit (app.py, pages/, src/) — mantido até ser aposentado
```

## 4. Banco de dados (Supabase / Postgres)

### Tabelas

| Tabela | Colunas principais | Casa |
|---|---|---|
| `empresas` | id, nome, slug | — |
| `perfis` | id (= `auth.users.id`), empresa_id, nome, papel, ativo | sim |
| `categorias` | id, empresa_id, tipo (`ficha` \| `insumo`), nome — único por (empresa, tipo, nome) | sim |
| `insumos` | id, empresa_id, nome, unidade (`g`,`kg`,`ml`,`l`,`un`,`pc`), categoria_id — único por (empresa, nome) | sim |
| `fichas` | id, empresa_id, nome, categoria_id, rendimento_qtd, rendimento_unidade, observacoes, validade_congelado_dias, validade_refrigerado_dias, validade_ambiente_dias, verificada, ativa, criado_em — único por (empresa, nome) | sim |
| `ficha_itens` | id, ficha_id, ordem, insumo_id **ou** sub_ficha_id (exatamente um), quantidade, unidade_sub, observacao | pela ficha |
| `passos` | id, ficha_id, ordem, descricao, tempo_min | pela ficha |
| `alergenos` | id, nome, icone, descricao — catálogo global | — |
| `ficha_alergenos` | ficha_id, alergeno_id | pela ficha |

- `ficha_itens` ganha a coluna `ordem` (o app atual depende da ordem de inserção) para a
  lista de ingredientes sair na mesma sequência da planilha.
- Auditoria e log de acessos **não** entram na Entrega 1 (vêm na Entrega 3, com as telas).
- Foto da ficha fica fora da Entrega 1 (vem na Entrega 4).

### Papéis

| Papel | Quem | Pode |
|---|---|---|
| `gestao` | Ana, chef | ler tudo da própria casa; criar/editar (usado a partir da Entrega 2) |
| `cozinha` | login compartilhado da cozinha | só ler a própria casa |

O papel "admin master" (trocar de casa) volta quando houver mais de uma casa.

### Regras de segurança (RLS)

Funções auxiliares (`security definer`, leem `perfis` do usuário logado e exigem `ativo`):
`minha_empresa()` e `sou_gestao()`.

| Tabela | Ler (select) | Criar/editar/excluir |
|---|---|---|
| tabelas com `empresa_id` | `empresa_id = minha_empresa()` | `sou_gestao()` **e** `empresa_id = minha_empresa()` |
| `ficha_itens`, `passos`, `ficha_alergenos` | a ficha pai é da minha casa | `sou_gestao()` e a ficha pai é da minha casa |
| `alergenos` | qualquer usuário logado | ninguém pelo app (só migração/SQL) |
| `perfis` | o próprio perfil | ninguém pelo app na Entrega 1 |
| `empresas` | a própria casa | ninguém pelo app |

Sem login (`anon`), nenhuma tabela retorna dados. Perfil inativo não enxerga nada.

## 5. Migração dos dados

`scripts/migrar_para_supabase.py` (Python):

1. Lê o SQLite local (`fichas_brava.db`).
2. Grava no Supabase, usando a conexão direta do Postgres (fica no `.env` local, fora do git):
   empresa, alérgenos, categorias, insumos, fichas, itens (com `ordem`), passos, alérgenos
   das fichas.
3. Cria os usuários pelo Admin API do Supabase: Ana (`gestao`), chef (`gestao`, e-mail a
   confirmar com a Ana) e cozinha (`cozinha`). Senhas provisórias geradas e gravadas em
   `ACESSO_SUPABASE.txt` (no `.gitignore`).
4. **Pode ser rodado de novo:** apaga e regrava os dados de fichas do Brava no Supabase a
   partir do SQLite. Não recria usuários que já existem.

Enquanto a Entrega 2 não fica pronta, **o cadastro continua no app Streamlit (SQLite)** e a
migração é rodada de novo para levar as mudanças ao Supabase. Isso é seguro porque a
Entrega 1 não tem telas de edição: o SQLite é a única fonte de verdade até a Entrega 2.

## 6. Telas da Entrega 1

Visual: paleta vinho `#6D1A2B` / vinho escuro `#3D0A16` / dourado `#C9A961`, logo da Brava
(`assets/logo_brava.png`). Tailwind CSS + componentes shadcn/ui.

| Rota | Conteúdo |
|---|---|
| `/login` | E-mail e senha sobre fundo vinho, com logo. Erro claro para credencial inválida |
| `/fichas` | Busca por nome (sem acento/maiúsculas), filtro por categoria, só fichas ativas. Cartão: nome, categoria, rendimento, selo "Não verificada" quando for o caso. Celular: 1 coluna; computador: grade de 3–4 colunas |
| `/fichas/[id]` | Nome, categoria, selo de verificação, alérgenos, rendimento, validades (quando houver), multiplicador, ingredientes, modo de preparo, observações |
| `/conta/senha` | Trocar a própria senha (necessário para sair da senha provisória) |

Menu: logo, "Fichas", "Trocar senha", "Sair". Usuário sem sessão é levado ao `/login` e,
depois de entrar, volta para a página que tentou abrir.

### Ficha completa

- **Celular:** blocos empilhados — cabeçalho, multiplicador, ingredientes, preparo, observações.
- **Computador:** ingredientes e preparo lado a lado.
- **Observações:** o texto atual usa Markdown simples (negrito, itálico, quebras de linha);
  é renderizado como Markdown, sem HTML.

### Multiplicador

Botões rápidos (×0,5, ×1, ×2, ×3) e campo livre (número > 0). Recalcula no navegador, sem
nova consulta. Regras portadas de `src/fichabase/receitas.py`:

- Exibição na unidade mais legível: `kg < 1 → g`, `l < 1 → ml`, `g ≥ 1000 → kg`, `ml ≥ 1000 → l`.
- Números com vírgula e sem zeros sobrando (`1,5 kg`, `100 g`).
- Quantidade 0 → "a gosto".

### Sub-receitas

Item que é outra ficha mostra "ver composição", que abre os ingredientes dela na proporção
usada: `fator = quantidade usada (convertida para a unidade do rendimento) / rendimento da
sub-ficha`, multiplicado pelo multiplicador da tela. Não expande (mostra aviso) quando:
a sub-ficha já apareceu no caminho (circular), não tem rendimento, ou as unidades são
incompatíveis. Link "abrir ficha" leva à ficha da sub-receita.

Dados: a página da ficha busca a ficha e, em seguida, as sub-fichas necessárias em lotes
por nível (até a profundidade encontrada, com proteção contra ciclo), e monta a árvore no
servidor.

## 7. Erros

| Situação | Comportamento |
|---|---|
| Login inválido | "E-mail ou senha incorretos." |
| Sessão expirada | Volta ao login; após entrar, retorna à página anterior |
| Ficha inexistente, inativa ou de outra casa | Página "Ficha não encontrada" |
| Falha de rede/Supabase | Mensagem "Não foi possível carregar. Tente novamente." com botão |
| Multiplicador inválido (vazio, 0, negativo) | Mantém o último valor válido |

## 8. Testes

- **Unitários (Vitest):** formatação de quantidade e unidades, conversões, "a gosto",
  fator de sub-receita, proteção contra ciclo, busca sem acento.
- **RLS (SQL em `supabase/tests/`):** com usuário `cozinha`, insert/update/delete falham;
  usuário de outra casa não vê dados do Brava; `anon` não vê nada; perfil inativo não vê nada.
- **Migração:** depois de rodar, contagens no Supabase batem com o SQLite (fichas, insumos,
  itens, passos, alérgenos por ficha) e uma amostra de fichas bate item a item.
- **Navegador:** conferência manual das telas em largura de celular e de computador antes
  da entrega.

## 9. Critérios de pronto (Entrega 1)

1. O link da Vercel abre o login com a logo e a paleta da Brava.
2. O login da cozinha vê as 43 fichas, busca, filtra, abre, multiplica e vê a composição das
   sub-receitas; qualquer tentativa de edição é recusada pelo banco.
3. O login da Ana vê o mesmo e consegue trocar a própria senha.
4. Todos os testes da seção 8 passam.
5. O app Streamlit continua funcionando localmente para o cadastro até a Entrega 2.

## 10. Fora do escopo da Entrega 1

Cadastro e edição, verificar ficha, gestão de usuários pela tela, auditoria, log de acessos,
impressão, fotos, seletor de casa, recuperação de senha por e-mail (a gestão redefine pelo
painel do Supabase se alguém esquecer).

## 11. O que a Ana precisa fazer

1. Criar o projeto no Supabase (região São Paulo).
2. Criar a conta na Vercel e conectar ao GitHub (`anakeles26/fichas-brava`), com
   **Root Directory = `web`**.
3. Informar o e-mail do chef para o login de gestão.
4. Verificar se o uso se encaixa no plano gratuito (Hobby) da Vercel, que é para uso não
   comercial, ou se será necessário o plano Pro.
