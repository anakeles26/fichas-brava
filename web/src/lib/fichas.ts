import "server-only";

import type { FichaDados, ItemDados } from "./composicao";
import { criarClienteServidor } from "./supabase/servidor";

export type FichaResumo = {
  id: number;
  nome: string;
  categoria: string | null;
  rendimento_qtd: number;
  rendimento_unidade: string;
  verificada: boolean;
};

export type FichaCompleta = FichaDados & {
  categoria: string | null;
  verificada: boolean;
  observacoes: string | null;
  validade_congelado_dias: number | null;
  validade_refrigerado_dias: number | null;
  validade_ambiente_dias: number | null;
  alergenos: { nome: string; icone: string | null }[];
  passos: { ordem: number; descricao: string; tempo_min: number | null }[];
};

const CAMPOS_ITENS =
  "itens:ficha_itens(id, ordem, quantidade, observacao, sub_ficha_id, unidade_sub, insumo:insumos(nome, unidade))";

// Sub-receita dentro de sub-receita tem limite para uma ficha mal cadastrada não virar
// um laço de consultas (a montagem da árvore já corta ciclos; isto limita a busca).
const MAX_NIVEIS_SUB_RECEITA = 10;

type LinhaResumo = {
  id: number;
  nome: string;
  rendimento_qtd: number;
  rendimento_unidade: string;
  verificada: boolean;
  categoria: { nome: string } | null;
};

/** Fichas ativas da casa da pessoa logada (a RLS filtra a casa), em ordem alfabética. */
export async function listarFichas(): Promise<FichaResumo[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("fichas")
    .select("id, nome, rendimento_qtd, rendimento_unidade, verificada, categoria:categorias(nome)")
    .eq("ativa", true)
    .order("nome")
    .returns<LinhaResumo[]>();
  if (error) throw new Error(`Erro ao listar fichas: ${error.message}`);
  return data.map((f) => ({
    id: f.id,
    nome: f.nome,
    categoria: f.categoria?.nome ?? null,
    rendimento_qtd: Number(f.rendimento_qtd),
    rendimento_unidade: f.rendimento_unidade,
    verificada: f.verificada,
  }));
}

type LinhaFicha = {
  id: number;
  nome: string;
  rendimento_qtd: number;
  rendimento_unidade: string;
  itens: ItemDados[];
};

type LinhaFichaCompleta = LinhaFicha & {
  verificada: boolean;
  observacoes: string | null;
  validade_congelado_dias: number | null;
  validade_refrigerado_dias: number | null;
  validade_ambiente_dias: number | null;
  categoria: { nome: string } | null;
  ficha_alergenos: { alergeno: { nome: string; icone: string | null } | null }[];
  passos: { ordem: number; descricao: string; tempo_min: number | null }[];
};

function paraFichaDados(f: LinhaFicha): FichaDados {
  return {
    id: f.id,
    nome: f.nome,
    rendimento_qtd: Number(f.rendimento_qtd),
    rendimento_unidade: f.rendimento_unidade,
    itens: f.itens.map((i) => ({ ...i, quantidade: Number(i.quantidade) })),
  };
}

/**
 * A ficha ativa com tudo o que a tela mostra, mais as sub-fichas que ela usa (em
 * qualquer nível), buscadas em lotes por nível. null = não existe, está inativa ou é
 * de outra casa (a RLS esconde) — a tela mostra "ficha não encontrada" nos três casos.
 */
export async function buscarFicha(
  id: number,
): Promise<{ ficha: FichaCompleta; fichas: Map<number, FichaDados> } | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("fichas")
    .select(
      `id, nome, rendimento_qtd, rendimento_unidade, verificada, observacoes,
       validade_congelado_dias, validade_refrigerado_dias, validade_ambiente_dias,
       categoria:categorias(nome),
       ficha_alergenos(alergeno:alergenos(nome, icone)),
       passos(ordem, descricao, tempo_min),
       ${CAMPOS_ITENS}`,
    )
    .eq("id", id)
    .eq("ativa", true)
    .maybeSingle<LinhaFichaCompleta>();
  if (error) throw new Error(`Erro ao carregar a ficha: ${error.message}`);
  if (!data) return null;

  const fichas = new Map<number, FichaDados>([[data.id, paraFichaDados(data)]]);
  let pendentes = idsDeSubFichas([data], fichas);
  for (let nivel = 0; pendentes.length > 0 && nivel < MAX_NIVEIS_SUB_RECEITA; nivel++) {
    // Sub-receita inativa continua valendo dentro da ficha que a usa: não filtra "ativa".
    const { data: subs, error: erroSub } = await supabase
      .from("fichas")
      .select(`id, nome, rendimento_qtd, rendimento_unidade, ${CAMPOS_ITENS}`)
      .in("id", pendentes)
      .returns<LinhaFicha[]>();
    if (erroSub) throw new Error(`Erro ao carregar sub-receitas: ${erroSub.message}`);
    for (const sub of subs) fichas.set(sub.id, paraFichaDados(sub));
    pendentes = idsDeSubFichas(subs, fichas);
  }

  const ficha: FichaCompleta = {
    ...paraFichaDados(data),
    categoria: data.categoria?.nome ?? null,
    verificada: data.verificada,
    observacoes: data.observacoes,
    validade_congelado_dias: data.validade_congelado_dias,
    validade_refrigerado_dias: data.validade_refrigerado_dias,
    validade_ambiente_dias: data.validade_ambiente_dias,
    alergenos: data.ficha_alergenos
      .map((fa) => fa.alergeno)
      .filter((a): a is { nome: string; icone: string | null } => a !== null)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    passos: [...data.passos].sort((a, b) => a.ordem - b.ordem),
  };
  return { ficha, fichas };
}

function idsDeSubFichas(linhas: LinhaFicha[], jaCarregadas: Map<number, FichaDados>): number[] {
  const ids = new Set<number>();
  for (const linha of linhas) {
    for (const item of linha.itens) {
      if (item.sub_ficha_id !== null && !jaCarregadas.has(item.sub_ficha_id)) ids.add(item.sub_ficha_id);
    }
  }
  return [...ids];
}
