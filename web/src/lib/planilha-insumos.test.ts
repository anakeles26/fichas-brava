import { describe, expect, test, vi } from "vitest";

// "server-only" só existe dentro do Next; nos testes é um módulo vazio.
vi.mock("server-only", () => ({}));

import { abrirPlanilha, gerarModeloInsumos, linhasDaAba } from "./excel";
import { lerCsv, lerLinhasInsumos, normalizarUnidade } from "./planilha-insumos";

describe("planilha de insumos", () => {
  test("padroniza unidades como o app antigo", () => {
    expect(["Quilo", "gramas", "LT", "mililitro", "unid", "peça", "", "caixa"].map(normalizarUnidade)).toEqual([
      "kg", "g", "l", "ml", "un", "pc", "un", "un",
    ]);
  });

  test("acha as colunas em qualquer ordem e com acento/maiúscula", () => {
    const r = lerLinhasInsumos([
      ["CATEGORIA", "Unidade", "nome"],
      ["Mercearia", "kg", "Arroz"],
      ["", "quilos", "Feijão"],
      ["Frios", "kg", ""],
    ]);
    expect(r).toEqual({
      linhas: [
        { nome: "Arroz", unidade: "kg", categoria: "Mercearia" },
        { nome: "Feijão", unidade: "kg", categoria: null },
      ],
    });
  });

  test("explica quando falta a coluna Nome", () => {
    expect(lerLinhasInsumos([["Produto", "Unidade"]])).toEqual({
      erro: 'A planilha precisa de uma coluna chamada "Nome". Colunas encontradas: Produto, Unidade.',
    });
  });

  test("lê CSV com ponto e vírgula e aspas", () => {
    expect(lerCsv('﻿Nome;Unidade\n"Molho ""da casa""";l\n\nOvos;un\n')).toEqual([
      ["Nome", "Unidade"],
      ['Molho "da casa"', "l"],
      ["Ovos", "un"],
    ]);
  });

  test("o modelo gerado é lido de volta pelo próprio importador", async () => {
    const livro = await abrirPlanilha(await gerarModeloInsumos());
    const r = lerLinhasInsumos(linhasDaAba(livro.worksheets[0]));
    expect(r).toEqual({
      linhas: [
        { nome: "Arroz branco", unidade: "kg", categoria: "Mercearia" },
        { nome: "Óleo de soja", unidade: "l", categoria: "Mercearia" },
        { nome: "Camarão limpo", unidade: "kg", categoria: "Proteínas" },
        { nome: "Ovos", unidade: "un", categoria: "Proteínas" },
      ],
    });
  });
});
