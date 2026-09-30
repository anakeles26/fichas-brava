import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { linhasDaAba } from "./excel";
import {
  AbaForaDoModelo,
  alergenosDeclarados,
  chave,
  diasRefrigeracao,
  fichaVazia,
  frase,
  lerAba,
  montarObservacoes,
  numeroBr,
  rendimentoEstimadoG,
} from "./leitor-ficha";

/** Monta uma aba no modelo do chef (células nas mesmas colunas: A, E, G). */
function abaModelo(celulas: Record<string, string | number>): unknown[][] {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet("X");
  for (const [endereco, valor] of Object.entries(celulas)) aba.getCell(endereco).value = valor;
  return linhasDaAba(aba);
}

const MOLHO = {
  E1: "BRAVA WINE",
  A3: "FICHA TÉCNICA OPERACIONAL",
  E4: "Produto:MOLHO ROTI DA CASA",
  E5: "Rendimento:3.606",
  E6: "Número de porções:83",
  E7: "Porção em gramas:60",
  A9: "Ingredientes ", E9: "Peso Bruto", G9: "Peso Líquido",
  A10: "CEBOLA  BRANCA", E10: 600, G10: 550,
  A11: "OVOS", E11: 2, G11: 2,
  A12: "SALSINHA", E12: "0,5",
  A13: "TOTAL", E13: 602.5,
  A14: "MODO DE PREPARO",
  A15: "1 -LEVAR AO FORNO A 220°C POR ",
  A16: "40-50 MIN ATE DOURAR.DEGLASAR O FUNDO,SOLTANDO OS RESIDUOS",
  A17: "FORMAR O ROUX:JUNTAR A FARINHA",
  A18: "OBS:NUNCA DEIXE O ALHO DOURAR",
  A19: "8 -",
  A20: "OBSERVAÇÕES",
  A21: "Equipamentos utilizados:FOGAO/PANELA",
  A22: "Tempo de cocção:2 A 3H FOGO BAIXO",
  A23: "Outras orientações:GLUTEM,LACTOSE E GRAOS",
  A24: "REFRIGERAÇAO: 48H 2 - 4°C",
};

describe("leitor da planilha do chef", () => {
  test("lê cabeçalho, ingredientes, preparo e observações do modelo", () => {
    const f = lerAba(abaModelo(MOLHO), "ROTI");
    expect(f).toMatchObject({
      aba: "ROTI",
      produto: "MOLHO ROTI DA CASA",
      rendimentoG: 3606,
      porcoes: "83",
      porcaoG: "60",
      itens: [
        { nome: "CEBOLA BRANCA", pesoBruto: 600, pesoLiquido: 550 },
        { nome: "OVOS", pesoBruto: 2, pesoLiquido: 2 },
        { nome: "SALSINHA", pesoBruto: 0.5, pesoLiquido: null },
      ],
      passos: [
        "Levar ao forno a 220°C por 40-50 min ate dourar.",
        "Deglasar o fundo, soltando os residuos",
        "Formar o roux: juntar a farinha",
      ],
      avisosPreparo: ["Nunca deixe o alho dourar"],
      equipamentos: "FOGAO/PANELA",
      tempoCoccao: "2 A 3H FOGO BAIXO",
      orientacoes: "GLUTEM,LACTOSE E GRAOS",
      refrigeracao: "48H 2 - 4°C",
    });
    expect(fichaVazia(f)).toBe(false);
    expect(diasRefrigeracao(f.refrigeracao)).toBe(2);
    expect(alergenosDeclarados(f.orientacoes)).toEqual(["Glúten", "Lactose"]);
  });

  test("aba sem gramagem é 'vazia'; aba fora do modelo é recusada", () => {
    const vazia = lerAba(abaModelo({ E4: "Produto:TORTA", A9: "Ingredientes", A10: "OVOS", A11: "TOTAL", A12: "MODO DE PREPARO" }), "T");
    expect(fichaVazia(vazia)).toBe(true);
    expect(() => lerAba(abaModelo({ A1: "Lista de compras" }), "Compras")).toThrow(AbaForaDoModelo);
  });

  test("observações montadas como no script (opcional na importação)", () => {
    const f = lerAba(abaModelo(MOLHO), "ROTI");
    expect(montarObservacoes(f, "Executivo semana 8")).toBe(
      [
        "**Cardápio:** Executivo semana 8",
        "**Porções:** 83 · **Porção:** 60 g",
        "**Equipamentos:** Fogao / panela",
        "**Tempo de cocção:** 2 a 3h fogo baixo",
        "**Orientações:** Glúten, lactose e grãos",
        "**Refrigeração:** 48h 2 - 4°C",
        "**Atenção:** Nunca deixe o alho dourar",
      ].join("  \n"),
    );
  });

  test("funções de texto", () => {
    expect(chave("  Parmessão  ralado ")).toBe("PARMESSAO RALADO");
    expect(frase("REFOGAR O ALHO,A CEBOLA:MEXER A 180 ° C")).toBe("Refogar o alho, a cebola: mexer a 180°C");
    expect([numeroBr("425"), numeroBr("3.606"), numeroBr("0,5"), numeroBr("5 A 6 LT")]).toEqual([425, 3606, 0.5, null]);
    expect([diasRefrigeracao("5 DIAS"), diasRefrigeracao("12H"), diasRefrigeracao("sem")]).toEqual([5, 1, null]);
    expect(["5 A 6 LT", "2,5 kg", "3 L", "1-2 litros", "5701", "a gosto"].map(rendimentoEstimadoG)).toEqual([5500, 2500, 3000, 1500, null, null]);
  });
});

// Equivalência com o leitor Python nas planilhas reais do chef. As planilhas são receitas da
// casa e não vão para o git: o teste só roda se a pasta existir neste computador.
const PASTA_REAL = process.env.PLANILHAS_CHEF ?? "C:/Users/usuario/Desktop/TEMPORÁRIOS/fichas andre";
const RAIZ = resolve(__dirname, "../../..");
const PYTHON = join(RAIZ, ".venv/Scripts/python.exe");
const temReais = existsSync(PASTA_REAL) && existsSync(PYTHON);

describe.runIf(temReais)("planilhas reais do chef (só local)", () => {
  test("o leitor TypeScript dá o mesmo resultado do leitor Python em todas as abas", async () => {
    const script = `
import json, sys, pathlib
sys.path.insert(0, "src")
from fichabase.importacao_fichas import ler_planilha
saida = {}
for arq in sorted(pathlib.Path(sys.argv[1]).glob("*.xlsx")):
    for f in ler_planilha(arq):
        saida[arq.name + "|" + f.aba] = {"produto": f.produto, "rendimentoG": f.rendimento_g,
            "itens": [[i.nome, i.peso_bruto, i.peso_liquido] for i in f.itens], "passos": f.passos,
            "avisos": f.avisos_preparo, "refrigeracao": f.refrigeracao, "orientacoes": f.orientacoes}
print(json.dumps(saida, ensure_ascii=False))`;
    const py = spawnSync(PYTHON, ["-c", script, PASTA_REAL], { cwd: RAIZ, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    expect(py.status, py.stderr).toBe(0);
    const esperado = JSON.parse(py.stdout.trim().split("\n").at(-1)!) as Record<string, unknown>;

    const obtido: Record<string, unknown> = {};
    for (const arquivo of readdirSync(PASTA_REAL).filter((a) => a.endsWith(".xlsx")).sort()) {
      const livro = new ExcelJS.Workbook();
      const bytes = readFileSync(join(PASTA_REAL, arquivo));
      await livro.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      for (const aba of livro.worksheets) {
        const f = lerAba(linhasDaAba(aba), aba.name);
        obtido[`${arquivo}|${aba.name}`] = {
          produto: f.produto,
          rendimentoG: f.rendimentoG,
          itens: f.itens.map((i) => [i.nome, i.pesoBruto, i.pesoLiquido]),
          passos: f.passos,
          avisos: f.avisosPreparo,
          refrigeracao: f.refrigeracao,
          orientacoes: f.orientacoes,
        };
      }
    }
    expect(Object.keys(obtido).length).toBeGreaterThan(40);
    expect(obtido).toEqual(esperado);
  }, 120_000);
});
