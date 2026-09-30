# Fichas Brava — Entrega 2 (Cadastro) — Design

**Data:** 30/09/2026
**Status:** aprovado em conversa; aguardando revisão do documento
**Base:** Entrega 1 publicada (`2026-09-29-fichas-brava-vercel-design.md`) — consulta de fichas no
Next.js + Supabase, visual igual ao app Streamlit.

## 1. Objetivo

Levar para o app novo o cadastro que hoje só existe no app Streamlit — insumos, categorias e
fichas — mais a **importação das planilhas semanais do chef** direto pelo app. Ao final, o
Supabase é a única fonte de verdade e o app Streamlit é aposentado para cadastro.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Escopo | Entrega 2 completa: insumos, categorias, fichas e importação (opção A) |
| Edição de ficha | **Tela única** de edição, com **um Salvar** que grava tudo de uma vez |
| Verificação | **Qualquer gestão** marca como verificada; o selo **permanece** após edições |
| Importação | Insumos (planilha modelo) **e** planilhas do chef ("FICHA TÉCNICA OPERACIONAL") |
| Nome desconhecido na planilha | Prévia **sugere** o insumo parecido; a pessoa escolhe; a escolha vira **apelido** e é reaproveitada |
| Auditoria | Toda alteração grava um registro; tela de consulta fica para a Entrega 3 |
| Fora do escopo | Foto e impressão (Entrega 4); usuários, alérgenos (catálogo) e log de acessos pela tela (Entrega 3); excluir insumo |

## 3. Banco de dados

### 3.1 Tabelas novas

| Tabela | Colunas | Observações |
|---|---|---|
| `apelidos` | id, empresa_id, chave (texto normalizado), insumo_id **ou** ficha_id (exatamente um), criado_em | único por (empresa_id, chave). `chave` = sem acento, maiúsculas, espaços simples (mesma regra de `chave()` do leitor Python) |
| `log_auditoria` | id, empresa_id, usuario_id, acao (`criar`/`editar`/`inativar`/`reativar`/`verificar`/`excluir`/`importar`), entidade (`ficha`/`insumo`/`categoria`/`planilha`), entidade_id, descricao, criado_em | só inserção; sem update/delete para ninguém pelo app |
| `importacoes` | id, empresa_id, usuario_id, arquivo, fichas_criadas, fichas_substituidas, fichas_puladas, insumos_criados, apelidos_criados, criado_em | um registro por planilha importada |

### 3.2 Colunas novas

`fichas.verificada_em` (timestamptz) e `fichas.verificada_por` (uuid → perfis): quem deu o "ok"
técnico e quando. Continuam valendo após edições (decisão da seção 2).

### 3.3 Operações (funções no banco, "tudo ou nada")

Toda gravação feita pelo app passa por uma função Postgres chamada via RPC. Cada função roda
numa única transação, grava a mudança **e** o `log_auditoria`, e é `security invoker` — ou seja,
a RLS da Entrega 1 continua valendo por dentro (a cozinha é recusada).

| Função | Faz |
|---|---|
| `salvar_categoria(p jsonb) → bigint` | cria ou renomeia categoria (tipo `ficha` ou `insumo`) |
| `excluir_categoria(p_id bigint)` | exclui; fichas/insumos dela ficam sem categoria (FK já é `on delete set null`) |
| `salvar_insumo(p jsonb) → bigint` | cria ou edita (nome, unidade, categoria); nome repetido → erro claro |
| `mudar_categoria_insumos(p_ids bigint[], p_categoria_id bigint)` | edição em massa |
| `importar_insumos(p_linhas jsonb) → jsonb` | planilha modelo de insumos (Nome, Unidade, Categoria); ignora os que já existem; cria categorias que faltarem; devolve o resumo |
| `salvar_ficha(p jsonb) → bigint` | cria ou edita a ficha inteira: dados, itens (substitui), passos (substitui), alérgenos (substitui) |
| `definir_ficha_ativa(p_id bigint, p_ativa boolean)` | inativar / reativar |
| `verificar_ficha(p_id bigint)` | marca verificada + `verificada_em` / `verificada_por` |
| `importar_planilha(p jsonb) → jsonb` | aplica a prévia confirmada (seção 4.6) e devolve o resumo |

Regras garantidas pelas funções (além das restrições das tabelas):

- **Sub-receita circular:** `salvar_ficha` e `importar_planilha` recusam item que faça a ficha
  depender dela mesma, direta ou indiretamente (consulta recursiva nas sub-fichas).
- **Mesma casa:** insumo, sub-ficha e categoria usados precisam ser da casa (já coberto pela RLS
  da Entrega 1, com teste).
- **Ordem:** a posição na lista enviada vira `ordem` de itens e passos.
- **Mensagens de erro em português**, repassadas à tela (ex.: "Já existe uma ficha com esse nome").

### 3.4 Segurança

- `apelidos`, `importacoes`: leitura para todos da casa; escrita só gestão da casa.
- `log_auditoria`: leitura só gestão da casa; inserção só com `usuario_id = auth.uid()` e gestão;
  update/delete negados.
- Funções: `execute` só para `authenticated`; revogado de `anon`/`public`.

### 3.5 Dados iniciais

- **Apelidos:** gerados a partir de `INSUMOS` e `SUB_RECEITAS` de `scripts/importar_fichas_brava.py`
  (ex.: `PARMESSAO → Parmesão`, `MOLHO POMORORO → Molho pomodoro`), além do próprio nome de
  cada insumo e ficha existente.
- **Categorias de insumo:** Proteínas, Laticínios, Hortifruti, Mercearia, Temperos e especiarias,
  Bebidas e vinhos, Congelados.

## 4. Telas

### 4.1 Menu

| Grupo | Item | Quem vê |
|---|---|---|
| — | Dashboard | todos |
| Cozinha | Fichas Técnicas, Insumos | todos |
| Configurações | Categorias, Importar planilha | gestão |

Botões de gravação só aparecem para a gestão; a RLS continua sendo a barreira real.

### 4.2 Fichas Técnicas

- Lista: botão **+ Nova ficha técnica**; filtro **Ativas / Inativas** (gestão).
- Ficha completa: **Editar ficha**, **Inativar / Reativar**, **Marcar como verificada**
  (mostra "Verificada por X em dd/mm" quando já verificada).

### 4.3 Editor de ficha (`/fichas/nova` e `/fichas/[id]/editar`)

Seções: **Dados** (nome, categoria, rendimento quantidade+unidade, validades congelado /
refrigerado / ambiente), **Ingredientes**, **Modo de preparo**, **Alérgenos**, **Observações**.

- Ingrediente: busca única que lista insumos e fichas (sub-receitas, com selo), quantidade,
  unidade (só as compatíveis: insumo em g aceita g/kg; l aceita ml/l), observação; ▲ ▼ remover;
  **+ adicionar ingrediente**. A quantidade é gravada na unidade de cadastro do insumo
  (conversão com `converterUnidade`).
- Passos: texto + tempo opcional (min); ▲ ▼ remover; **+ adicionar passo**.
- Alérgenos: caixas de marcar do catálogo + **sugestão** calculada pelos ingredientes (regras
  de `ALERGENOS_POR_INSUMO`, portadas para TypeScript, e alérgenos das sub-receitas), com
  botão "aplicar sugestão". A marcação final é de quem edita.
- **Salvar** (uma chamada a `salvar_ficha`) e **Cancelar**; aviso ao sair com alterações não
  salvas; erros junto do campo (nome vazio/repetido, rendimento ≤ 0, item sem quantidade,
  sub-receita circular).

### 4.4 Insumos (`/insumos`)

Lista com busca, filtro de categoria (inclui "Sem categoria"), paginação, selos de unidade e
categoria. Gestão: **Novo insumo**, **Editar** por linha, **seleção múltipla → mudar
categoria**, **Importar planilha de insumos** (com download do modelo `.xlsx`). Sem excluir.

### 4.5 Categorias (`/categorias`)

Duas listas (ficha e insumo): criar, renomear, excluir — antes de excluir, avisa quantas
fichas/insumos ficariam sem categoria.

### 4.6 Importar planilha do chef (`/importar`)

1. **Enviar** `.xlsx` (uma ficha por aba, modelo "FICHA TÉCNICA OPERACIONAL").
2. **Prévia** (lida no servidor; nada é gravado):
   - para o arquivo todo: **cardápio** (ex.: "Executivo semana 8"), que vai para as observações
     de cada ficha, como nas fichas já importadas;
   - por ficha: nome (do "Produto:", editável), categoria (lista + "aplicar a todas"),
     situação 🟢 nova / 🟡 já existe (**pular** ou **substituir**, padrão pular);
   - por ingrediente: ✓ reconhecido (apelido ou nome igual) · **?** parecido (sugestão:
     usar / escolher outro / criar novo) · **+** novo (nome e unidade editáveis);
   - alérgenos sugeridos (mesma regra do editor);
   - avisos: aba sem gramagem (pulada), peso líquido > bruto, rendimento ≠ soma dos ingredientes.
3. **Confirmar** → `importar_planilha` → resumo (criadas, substituídas, puladas, insumos
   novos, apelidos aprendidos).

Regras do leitor (porte de `src/fichabase/importacao_fichas.py` para TypeScript, com a
biblioteca `exceljs` no servidor): procura rótulos em vez de linhas fixas; quantidade = peso
bruto; peso líquido diferente vai para a observação do item; modo de preparo juntado e
repartido por frase e por rótulo de etapa; "1 -" é numeração, "40-50 MIN" não; observações
montadas como no script (equipamentos, tempo, orientações, refrigeração); refrigeração em
dias vira `validade_refrigerado_dias`; ovos em unidade, resto em gramas.

**Sugestão de parecido:** similaridade entre as `chave`s (distância de edição normalizada);
sugere o melhor candidato com similaridade ≥ 0,6 entre insumos e fichas da casa.

**Substituir** uma ficha existente troca dados, itens, passos e alérgenos, mantendo o mesmo
`id` (links continuam valendo) e o selo de verificação (decisão da seção 2).

## 5. Transição (a "virada")

Na publicação da **parte 2** (primeira que grava pelo app novo):

1. Rodar `migrar_para_supabase.py` uma última vez — **só se** o app local tiver mudado desde a
   migração anterior (na virada de 30/09 não tinha: nenhum registro no log local depois de 28/09 e
   contagens iguais; por isso não foi rodado).
2. Travar o script: ele recusa rodar quando a migração `20260930000001_cadastro` já está aplicada.
   *Revisto na implementação:* a trava original ("recusar se houver registro em `log_auditoria`")
   não bastava — com o log ainda vazio, o script apagaria em cascata os apelidos e as categorias
   de insumo criados pela própria Entrega 2.
3. Supabase vira a fonte de verdade; o Streamlit fica só para consulta até ser desligado.

Entre as partes 2 e 3, ajustes de ficha são feitos por mim direto no banco, com registro no log.

## 6. Ordem de construção

| Parte | Conteúdo | Pronto quando |
|---|---|---|
| 1 | Migrações (tabelas, colunas, funções, RLS, apelidos e categorias iniciais) + testes | testes de banco passam |
| 2 | Categorias e Insumos + virada | Ana cria e edita insumo e categoria no site |
| 3 | Editor de ficha, inativar/reativar, verificar | Ana cria, edita, inativa e verifica ficha no site |
| 4 | Importar planilha do chef | Ana importa uma planilha real pelo site |

Cada parte é publicada ao terminar.

## 7. Testes

- **Banco (PGlite):** cozinha recusada em todas as funções; `salvar_ficha` com item inválido no
  meio não grava nada; sub-receita circular recusada; log grava o usuário certo; log não pode
  ser alterado/apagado; apelido criado é usado; `importar_planilha` é tudo-ou-nada.
- **Leitor de planilha (Vitest):** planilha de exemplo sintética (vai para o git) e as 7
  planilhas reais do chef (só local, fora do git — são receitas da casa): o resultado deve
  bater com as 43 fichas já importadas (nomes de produto, itens, pesos, passos).
- **Editor:** conversão g↔kg, sugestão de alérgenos, detecção de ciclo antes de enviar.
- **Navegador:** telas conferidas na prévia local com dados de exemplo; teste final logado
  (salvar e importar de verdade) feito pela Ana, com roteiro curto.

## 8. Critérios de pronto

1. Gestão cria/edita insumos e categorias, muda categoria em massa e importa planilha de insumos.
2. Gestão cria, edita (tela única), inativa, reativa e verifica fichas; a cozinha só consulta.
3. Uma planilha real do chef é importada pelo app, com prévia, apelidos aprendidos e resumo.
4. Toda alteração aparece em `log_auditoria` com usuário e data.
5. Script de migração travado; Supabase é a fonte de verdade.
6. Todos os testes da seção 7 passam.
