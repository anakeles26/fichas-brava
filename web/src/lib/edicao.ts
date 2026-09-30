import "server-only";

import { criarClienteServidor } from "./supabase/servidor";

export type FichaEdicao = {
  id: number;
  nome: string;
  categoria_id: number | null;
  rendimento_qtd: number;
  rendimento_unidade: string;
  validade_congelado_dias: number | null;
  validade_refrigerado_dias: number | null;
  validade_ambiente_dias: number | null;
  observacoes: string | null;
  itens: {
    ordem: number;
    insumo_id: number | null;
    sub_ficha_id: number | null;
    quantidade: number;
    unidade_sub: string | null;
    observacao: string | null;
  }[];
  passos: { ordem: number; descricao: string; tempo_min: number | null }[];
  ficha_alergenos: { alergeno_id: number }[];
};

/** A ficha como está gravada (ids, não nomes), para preencher o editor. */
export async function buscarFichaParaEdicao(id: number): Promise<FichaEdicao | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("fichas")
    .select(
      `id, nome, categoria_id, rendimento_qtd, rendimento_unidade, observacoes,
       validade_congelado_dias, validade_refrigerado_dias, validade_ambiente_dias,
       itens:ficha_itens!ficha_itens_ficha_id_fkey(ordem, insumo_id, sub_ficha_id, quantidade, unidade_sub, observacao),
       passos(ordem, descricao, tempo_min),
       ficha_alergenos(alergeno_id)`,
    )
    .eq("id", id)
    .maybeSingle<FichaEdicao>();
  if (error) throw new Error(`Erro ao carregar a ficha: ${error.message}`);
  if (!data) return null;
  return {
    ...data,
    rendimento_qtd: Number(data.rendimento_qtd),
    itens: [...data.itens].sort((a, b) => a.ordem - b.ordem).map((i) => ({ ...i, quantidade: Number(i.quantidade) })),
    passos: [...data.passos].sort((a, b) => a.ordem - b.ordem),
  };
}

export type OpcoesEditor = {
  insumos: { id: number; nome: string; unidade: string }[];
  fichas: { id: number; nome: string; rendimento_unidade: string; ativa: boolean; alergenos: string[] }[];
  alergenos: { id: number; nome: string }[];
  categorias: { id: number; nome: string }[];
};

type LinhaFichaOpcao = {
  id: number;
  nome: string;
  rendimento_unidade: string;
  ativa: boolean;
  ficha_alergenos: { alergeno: { nome: string } | null }[];
};

/** Listas do editor: insumos, fichas (para sub-receita), catálogo de alérgenos e categorias de ficha. */
export async function carregarOpcoesEditor(): Promise<OpcoesEditor> {
  const supabase = await criarClienteServidor();
  const [insumos, fichas, alergenos, categorias] = await Promise.all([
    supabase.from("insumos").select("id, nome, unidade").order("nome"),
    supabase
      .from("fichas")
      .select("id, nome, rendimento_unidade, ativa, ficha_alergenos(alergeno:alergenos(nome))")
      .order("nome")
      .returns<LinhaFichaOpcao[]>(),
    supabase.from("alergenos").select("id, nome").order("nome"),
    supabase.from("categorias").select("id, nome").eq("tipo", "ficha").order("nome"),
  ]);
  if (insumos.error || fichas.error || alergenos.error || categorias.error) {
    const erro = insumos.error ?? fichas.error ?? alergenos.error ?? categorias.error;
    throw new Error(`Erro ao carregar o editor: ${erro?.message}`);
  }
  return {
    insumos: insumos.data,
    fichas: fichas.data.map(({ ficha_alergenos, ...f }) => ({
      ...f,
      alergenos: ficha_alergenos.map((fa) => fa.alergeno?.nome).filter((n): n is string => !!n),
    })),
    alergenos: alergenos.data,
    categorias: categorias.data,
  };
}
