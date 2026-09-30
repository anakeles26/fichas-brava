// Planilha de insumos (Nome / Unidade / Categoria) — porte de src/fichabase/importacao.py.
// Funções puras: recebem as linhas já lidas (Excel ou CSV) e devolvem o que importar.

import { normalizar } from "./busca";

export type LinhaInsumo = { nome: string; unidade: string; categoria: string | null };

// Variações que aparecem nas planilhas → unidade usada no sistema.
const UNIDADES: Record<string, string> = {
  kg: "kg", quilo: "kg", quilos: "kg", kilo: "kg",
  g: "g", gr: "g", grama: "g", gramas: "g",
  l: "l", lt: "l", litro: "l", litros: "l",
  ml: "ml", mililitro: "ml",
  un: "un", und: "un", unid: "un", unidade: "un", unidades: "un",
  pc: "pc", "pç": "pc", peca: "pc", "peça": "pc",
};

/** Unidade da planilha → unidade do sistema. Desconhecida ou vazia vira "un". */
export function normalizarUnidade(valor: unknown): string {
  return UNIDADES[String(valor ?? "").trim().toLowerCase()] ?? "un";
}

export const COLUNAS_MODELO = ["Nome", "Unidade", "Categoria"] as const;

export const EXEMPLOS_MODELO: [string, string, string][] = [
  ["Arroz branco", "kg", "Mercearia"],
  ["Óleo de soja", "l", "Mercearia"],
  ["Camarão limpo", "kg", "Proteínas"],
  ["Ovos", "un", "Proteínas"],
];

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

/**
 * Primeira linha = cabeçalho. Acha as colunas pelo nome (sem acento/maiúsculas, em
 * qualquer ordem). Linhas sem nome são descartadas. Erro se não houver coluna "Nome".
 */
export function lerLinhasInsumos(linhas: unknown[][]): { linhas: LinhaInsumo[] } | { erro: string } {
  const [cabecalho = [], ...dados] = linhas;
  const indice = (rotulo: string) => cabecalho.findIndex((c) => normalizar(texto(c)) === rotulo);
  const colNome = indice("nome");
  if (colNome < 0) {
    const encontradas = cabecalho.map(texto).filter(Boolean).join(", ") || "nenhuma";
    return { erro: `A planilha precisa de uma coluna chamada "Nome". Colunas encontradas: ${encontradas}.` };
  }
  const colUnidade = indice("unidade");
  const colCategoria = indice("categoria");

  return {
    linhas: dados
      .map((linha) => ({
        nome: texto(linha[colNome]),
        unidade: normalizarUnidade(colUnidade >= 0 ? linha[colUnidade] : ""),
        categoria: colCategoria >= 0 ? texto(linha[colCategoria]) || null : null,
      }))
      .filter((l) => l.nome !== ""),
  };
}

/** CSV simples (vírgula ou ponto e vírgula, aspas opcionais) → linhas. */
export function lerCsv(conteudo: string): string[][] {
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const separador = (linhas[0] ?? "").includes(";") ? ";" : ",";
  return linhas.map((linha) => {
    const campos: string[] = [];
    let atual = "";
    let entreAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"' && linha[i + 1] === '"' && entreAspas) {
        atual += '"';
        i++;
      } else if (c === '"') {
        entreAspas = !entreAspas;
      } else if (c === separador && !entreAspas) {
        campos.push(atual);
        atual = "";
      } else {
        atual += c;
      }
    }
    campos.push(atual);
    return campos.map((c) => c.trim());
  });
}
