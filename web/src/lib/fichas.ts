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
  ativa: boolean;
  alergenos: string[];
};

export type FichaCompleta = FichaDados & {
  categoria: string | null;
  verificada: boolean;
  verificada_em: string | null;
  verificada_por: string | null; // nome de quem verificou
  ativa: boolean;
  observacoes: string | null;
  criado_em: string;
  validade_congelado_dias: number | null;
  validade_refrigerado_dias: number | null;
  validade_ambiente_dias: number | null;
  alergenos: { nome: string; icone: string | null }[];
  passos: { ordem: number; descricao: string; tempo_min: number | null }[];
};

// ficha_itens tem duas ligações com fichas (ficha_id = a ficha dona do item; sub_ficha_id =
// a sub-receita usada). Sem dizer qual, a API do Supabase recusa com PGRST201 ("more than
// one relationship"); aqui queremos os itens QUE PERTENCEM à ficha.
const CAMPOS_ITENS =
  "itens:ficha_itens!ficha_itens_ficha_id_fkey(id, ordem, quantidade, observacao, sub_ficha_id, unidade_sub, insumo:insumos(nome, unidade))";

// Sub-receita dentro de sub-receita tem limite para uma ficha mal cadastrada não virar
// um laço de consultas (a montagem da árvore já corta ciclos; isto limita a busca).
const MAX_NIVEIS_SUB_RECEITA = 10;

/** Números do Dashboard: fichas ativas e insumos da casa (a RLS filtra a casa). */
export async function contarCozinha(): Promise<{ fichasAtivas: number; insumos: number }> {
  const supabase = await criarClienteServidor();
  const [fichas, insumos] = await Promise.all([
    supabase.from("fichas").select("id", { count: "exact", head: true }).eq("ativa", true),
    supabase.from("insumos").select("id", { count: "exact", head: true }),
  ]);
  const erro = fichas.error ?? insumos.error;
  if (erro) throw new Error(`Erro ao contar fichas e insumos: ${erro.message}`);
  return { fichasAtivas: fichas.count ?? 0, insumos: insumos.count ?? 0 };
}

type LinhaResumo = {
  id: number;
  nome: string;
  rendimento_qtd: number;
  rendimento_unidade: string;
  verificada: boolean;
  ativa: boolean;
  categoria: { nome: string } | null;
  ficha_alergenos: { alergeno: { nome: string } | null }[];
};

/**
 * Fichas da casa da pessoa logada (a RLS filtra a casa), em ordem alfabética. Só as ativas,
 * a não ser que `incluirInativas` (gestão, para poder reativar).
 */
export async function listarFichas(incluirInativas = false): Promise<FichaResumo[]> {
  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("fichas")
    .select(
      "id, nome, rendimento_qtd, rendimento_unidade, verificada, ativa, categoria:categorias(nome), ficha_alergenos(alergeno:alergenos(nome))",
    );
  if (!incluirInativas) consulta = consulta.eq("ativa", true);
  const { data, error } = await consulta.order("nome").returns<LinhaResumo[]>();
  if (error) throw new Error(`Erro ao listar fichas: ${error.message}`);
  return data.map((f) => ({
    id: f.id,
    nome: f.nome,
    categoria: f.categoria?.nome ?? null,
    rendimento_qtd: Number(f.rendimento_qtd),
    rendimento_unidade: f.rendimento_unidade,
    verificada: f.verificada,
    ativa: f.ativa,
    alergenos: f.ficha_alergenos.map((fa) => fa.alergeno?.nome).filter((n): n is string => !!n),
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
  verificada_em: string | null;
  verificador: { nome: string } | null;
  ativa: boolean;
  observacoes: string | null;
  criado_em: string;
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
 * A ficha com tudo o que a tela mostra, mais as sub-fichas que ela usa (em qualquer
 * nível), buscadas em lotes por nível. null = não existe, é de outra casa (a RLS esconde)
 * ou está inativa sem `incluirInativa` — a tela mostra "ficha não encontrada".
 */
export async function buscarFicha(
  id: number,
  incluirInativa = false,
): Promise<{ ficha: FichaCompleta; fichas: Map<number, FichaDados> } | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("fichas")
    .select(
      `id, nome, rendimento_qtd, rendimento_unidade, verificada, verificada_em, ativa, observacoes, criado_em,
       verificador:perfis!fichas_verificada_por_fkey(nome),
       validade_congelado_dias, validade_refrigerado_dias, validade_ambiente_dias,
       categoria:categorias(nome),
       ficha_alergenos(alergeno:alergenos(nome, icone)),
       passos(ordem, descricao, tempo_min),
       ${CAMPOS_ITENS}`,
    )
    .eq("id", id)
    .maybeSingle<LinhaFichaCompleta>();
  if (error) throw new Error(`Erro ao carregar a ficha: ${error.message}`);
  if (!data || (!data.ativa && !incluirInativa)) return null;

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
    verificada_em: data.verificada_em,
    verificada_por: data.verificador?.nome ?? null,
    ativa: data.ativa,
    observacoes: data.observacoes,
    criado_em: data.criado_em,
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
