import "server-only";

import ExcelJS from "exceljs";
import { COLUNAS_MODELO, EXEMPLOS_MODELO } from "./planilha-insumos";

/** Valor de célula do exceljs → valor simples (fórmula vira o resultado; texto rico vira texto). */
export function valorCelula(valor: ExcelJS.CellValue): unknown {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "object" || valor instanceof Date) return valor;
  if ("result" in valor) return valorCelula(valor.result as ExcelJS.CellValue);
  if ("richText" in valor) return valor.richText.map((t) => t.text).join("");
  if ("text" in valor) return valor.text;
  return null;
}

/** Linhas da aba (lista de valores por coluna, começando na coluna A). */
export function linhasDaAba(aba: ExcelJS.Worksheet): unknown[][] {
  const linhas: unknown[][] = [];
  aba.eachRow({ includeEmpty: false }, (linha) => {
    const valores = linha.values as ExcelJS.CellValue[]; // índice 0 vazio: exceljs começa em 1
    linhas.push(valores.slice(1).map(valorCelula));
  });
  return linhas;
}

export async function abrirPlanilha(dados: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(dados);
  return livro;
}

/** Planilha modelo de insumos para baixar (cabeçalho vinho, exemplos de preenchimento). */
export async function gerarModeloInsumos(): Promise<ArrayBuffer> {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet("Insumos");
  aba.columns = COLUNAS_MODELO.map((titulo, i) => ({ header: titulo, key: titulo, width: [32, 12, 22][i] }));
  aba.getRow(1).eachCell((celula) => {
    celula.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D1A2B" } };
    celula.alignment = { horizontal: "center" };
  });
  for (const exemplo of EXEMPLOS_MODELO) aba.addRow(exemplo);
  return (await livro.xlsx.writeBuffer()) as ArrayBuffer;
}
