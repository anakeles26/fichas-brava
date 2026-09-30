# Plano — Entrega 2 (Cadastro)

Design: `docs/superpowers/specs/2026-09-30-entrega-2-cadastro-design.md`

## Parte 1 — Banco

1. `supabase/migrations/20260930000001_cadastro.sql`
   - colunas `fichas.verificada_em`, `fichas.verificada_por`;
   - tabelas `apelidos`, `log_auditoria`, `importacoes` (+ índices nas FKs, RLS, grants);
   - schema `interno` (não exposto pela API): `exigir_gestao()`, `registrar(...)`,
     `gravar_conteudo_ficha(...)`, `checar_ciclo(...)`;
   - funções RPC em `public`: `salvar_categoria`, `excluir_categoria`, `salvar_insumo`,
     `mudar_categoria_insumos`, `importar_insumos`, `salvar_ficha`, `definir_ficha_ativa`,
     `verificar_ficha`, `importar_planilha` — `security invoker`, `search_path = ''`,
     erros em português.
2. `supabase/migrations/20260930000002_dados_iniciais.sql` — categorias de insumo e apelidos
   do Brava (gerados de `scripts/importar_fichas_brava.py`), idempotente e sem falhar onde o
   Brava não existe (banco de teste).
3. `supabase/tests/cadastro.test.js` — cenários da seção 7 do design.
4. Aplicar no Supabase com `scripts/aplicar_migracoes_supabase.py`.

## Parte 2 — Categorias e Insumos + virada

1. Menu com Insumos, Categorias e Importar planilha (gestão); `perfil.papel` decide o que aparece.
2. `/insumos` e `/categorias` (Server Actions chamando as RPCs; revalidação da página).
3. Virada: última migração, trava no `migrar_para_supabase.py` (recusa se houver log).
4. Prévia local + roteiro de teste para a Ana.

## Parte 3 — Fichas

1. `/fichas/nova`, `/fichas/[id]/editar` (editor em componente de cliente; `salvar_ficha`).
2. Inativar / reativar / verificar no detalhe; filtro Ativas/Inativas na lista.
3. Regras puras com teste: conversão de unidade, sugestão de alérgenos, ciclo.

## Parte 4 — Importar planilha do chef

1. Leitor em TypeScript (`exceljs`) portado de `importacao_fichas.py`, com testes (planilha
   sintética no git; planilhas reais só locais).
2. Casamento de nomes: apelido → nome exato → parecido (distância de edição ≥ 0,6).
3. `/importar`: enviar → prévia editável → `importar_planilha` → resumo.

Cada parte termina com testes passando, commit e publicação.
