// Regras do editor de ficha (sem React): quais unidades cada item aceita, validação e
// montagem do que vai para a função salvar_ficha do banco.

import { converterUnidade } from "./quantidades";

// Unidades em que dá para digitar a quantidade, pela unidade de cadastro (UNIDADES_COMPATIVEIS
// de src/fichabase/receitas.py). Insumo em g aceita g ou kg; sub-receita segue o rendimento dela.
const COMPATIVEIS: Record<string, string[]> = {
  kg: ["g", "kg"],
  g: ["g", "kg"],
  l: ["ml", "l"],
  ml: ["ml", "l"],
  un: ["un"],
  pc: ["pc"],
};

export function unidadesCompativeis(unidadeBase: string): string[] {
  return COMPATIVEIS[unidadeBase] ?? [unidadeBase];
}

export type OpcaoInsumo = { id: number; nome: string; unidade: string };
export type OpcaoFicha = { id: number; nome: string; rendimento_unidade: string };

export type ItemEditor = {
  chave: string; // só para a lista na tela
  tipo: "insumo" | "sub";
  refId: number | null;
  quantidade: string; // como digitado ("1,5")
  unidade: string;
  observacao: string;
};

export type PassoEditor = { chave: string; descricao: string; tempo: string };

export type DadosEditor = {
  id: number | null;
  nome: string;
  categoriaId: string;
  rendimento: string;
  rendimentoUnidade: string;
  validadeCongelado: string;
  validadeRefrigerado: string;
  validadeAmbiente: string;
  observacoes: string;
  itens: ItemEditor[];
  passos: PassoEditor[];
  alergenoIds: number[];
};

/** "1,5" / "1.5" → 1.5; vazio → null; texto inválido → NaN. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  return limpo === "" ? null : Number(limpo);
}

function lerDias(texto: string, rotulo: string, erros: string[]): number | null {
  const n = lerNumero(texto);
  if (n === null) return null;
  if (!Number.isInteger(n) || n < 0) {
    erros.push(`Validade (${rotulo}) precisa ser um número inteiro de dias.`);
    return null;
  }
  return n;
}

/**
 * Valida o formulário e monta o objeto de salvar_ficha. Quantidade de insumo é gravada na
 * unidade de cadastro do insumo (digitou 1,5 kg de um insumo em g → grava 1500).
 */
export function montarFicha(
  dados: DadosEditor,
  insumos: ReadonlyMap<number, OpcaoInsumo>,
  fichas: ReadonlyMap<number, OpcaoFicha>,
): { ficha: Record<string, unknown> } | { erros: string[] } {
  const erros: string[] = [];
  const nome = dados.nome.trim();
  if (!nome) erros.push("Informe o nome da ficha.");

  const rendimento = lerNumero(dados.rendimento);
  if (rendimento === null || !(rendimento > 0)) erros.push("O rendimento precisa ser maior que zero.");

  const itens = dados.itens.map((item, n) => {
    const linha = `Ingrediente ${n + 1}`;
    const qtd = lerNumero(item.quantidade);
    if (item.refId === null) {
      erros.push(`${linha}: escolha o insumo ou a sub-receita.`);
      return null;
    }
    if (qtd === null || Number.isNaN(qtd) || qtd < 0) {
      erros.push(`${linha}: quantidade inválida (use 0 para "a gosto").`);
      return null;
    }
    const observacao = item.observacao.trim() || null;
    if (item.tipo === "sub") {
      if (item.refId === dados.id) {
        erros.push(`${linha}: a ficha não pode usar ela mesma como sub-receita.`);
        return null;
      }
      if (!fichas.has(item.refId)) {
        erros.push(`${linha}: sub-receita não encontrada.`);
        return null;
      }
      return { sub_ficha_id: item.refId, quantidade: qtd, unidade_sub: item.unidade, observacao };
    }
    const insumo = insumos.get(item.refId);
    if (!insumo) {
      erros.push(`${linha}: insumo não encontrado.`);
      return null;
    }
    const convertida = converterUnidade(qtd, item.unidade, insumo.unidade);
    if (convertida === null) {
      erros.push(`${linha}: "${item.unidade}" não combina com a unidade de "${insumo.nome}" (${insumo.unidade}).`);
      return null;
    }
    return { insumo_id: insumo.id, quantidade: Math.round(convertida * 10000) / 10000, observacao };
  });

  const ficha = {
    id: dados.id,
    nome,
    categoria_id: dados.categoriaId ? Number(dados.categoriaId) : null,
    rendimento_qtd: rendimento,
    rendimento_unidade: dados.rendimentoUnidade,
    validade_congelado_dias: lerDias(dados.validadeCongelado, "congelado", erros),
    validade_refrigerado_dias: lerDias(dados.validadeRefrigerado, "refrigerado", erros),
    validade_ambiente_dias: lerDias(dados.validadeAmbiente, "ambiente", erros),
    observacoes: dados.observacoes.trim() || null,
    itens,
    passos: dados.passos
      .filter((p) => p.descricao.trim() !== "")
      .map((p) => {
        const tempo = lerNumero(p.tempo);
        return { descricao: p.descricao.trim(), tempo_min: tempo !== null && Number.isInteger(tempo) && tempo >= 0 ? tempo : null };
      }),
    alergeno_ids: [...new Set(dados.alergenoIds)],
  };
  return erros.length ? { erros } : { ficha };
}

type FichaGravada = {
  id: number;
  nome: string;
  categoria_id: number | null;
  rendimento_qtd: number;
  rendimento_unidade: string;
  validade_congelado_dias: number | null;
  validade_refrigerado_dias: number | null;
  validade_ambiente_dias: number | null;
  observacoes: string | null;
  itens: { insumo_id: number | null; sub_ficha_id: number | null; quantidade: number; unidade_sub: string | null; observacao: string | null }[];
  passos: { descricao: string; tempo_min: number | null }[];
  ficha_alergenos: { alergeno_id: number }[];
};

const texto = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** Ficha gravada (ou nenhuma, para ficha nova) → estado inicial do editor. */
export function paraEditor(ficha: FichaGravada | null, insumos: ReadonlyMap<number, OpcaoInsumo>): DadosEditor {
  if (!ficha) {
    return {
      id: null, nome: "", categoriaId: "", rendimento: "", rendimentoUnidade: "g",
      validadeCongelado: "", validadeRefrigerado: "", validadeAmbiente: "", observacoes: "",
      itens: [], passos: [], alergenoIds: [],
    };
  }
  return {
    id: ficha.id,
    nome: ficha.nome,
    categoriaId: ficha.categoria_id ? String(ficha.categoria_id) : "",
    rendimento: texto(ficha.rendimento_qtd),
    rendimentoUnidade: ficha.rendimento_unidade,
    validadeCongelado: texto(ficha.validade_congelado_dias),
    validadeRefrigerado: texto(ficha.validade_refrigerado_dias),
    validadeAmbiente: texto(ficha.validade_ambiente_dias),
    observacoes: ficha.observacoes ?? "",
    // Quantidade na unidade de cadastro do insumo (é como está gravada).
    itens: ficha.itens.map((i, n) => ({
      chave: `i${n}`,
      tipo: i.sub_ficha_id !== null ? "sub" : "insumo",
      refId: i.sub_ficha_id ?? i.insumo_id,
      quantidade: texto(i.quantidade),
      unidade: i.sub_ficha_id !== null ? (i.unidade_sub ?? "g") : (insumos.get(i.insumo_id!)?.unidade ?? "g"),
      observacao: i.observacao ?? "",
    })),
    passos: ficha.passos.map((p, n) => ({ chave: `p${n}`, descricao: p.descricao, tempo: texto(p.tempo_min) })),
    alergenoIds: ficha.ficha_alergenos.map((a) => a.alergeno_id).sort((a, b) => a - b),
  };
}

/** Move o elemento da posição `de` para `de + passo` (▲ = -1, ▼ = +1). */
export function mover<T>(lista: T[], de: number, passo: -1 | 1): T[] {
  const para = de + passo;
  if (para < 0 || para >= lista.length) return lista;
  const nova = [...lista];
  [nova[de], nova[para]] = [nova[para], nova[de]];
  return nova;
}
