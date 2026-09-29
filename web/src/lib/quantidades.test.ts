import { describe, expect, test } from "vitest";
import { combina, normalizar } from "./busca";
import { type FichaDados, montarComposicao } from "./composicao";
import { converterUnidade, formatarNumero, formatarQuantidade, unidadeDeExibicao } from "./quantidades";

describe("quantidades", () => {
  test.each([
    [0.1, "kg", [100, "g"]],
    [0.25, "l", [250, "ml"]],
    [1500, "g", [1.5, "kg"]],
    [2000, "ml", [2, "l"]],
    [999, "g", [999, "g"]],
    [1, "kg", [1, "kg"]],
    [3, "un", [3, "un"]],
  ])("%s %s é exibido como %j", (qtd, unidade, esperado) => {
    expect(unidadeDeExibicao(qtd, unidade)).toEqual(esperado);
  });

  test("tira o ruído de ponto flutuante e usa vírgula", () => {
    expect(formatarNumero(0.003 * 1000)).toBe("3");
    expect(formatarNumero(1.5)).toBe("1,5");
    expect(formatarNumero(2.0004)).toBe("2");
    expect(formatarNumero(5701)).toBe("5701");
  });

  test("formata para a tela", () => {
    expect(formatarQuantidade(5701, "g")).toBe("5,701 kg");
    expect(formatarQuantidade(0.1, "kg")).toBe("100 g");
    expect(formatarQuantidade(1, "un")).toBe("1 un");
    expect(formatarQuantidade(0, "g")).toBe("a gosto");
  });

  test("converte só dentro da mesma grandeza", () => {
    expect(converterUnidade(2, "kg", "g")).toBe(2000);
    expect(converterUnidade(500, "ml", "l")).toBe(0.5);
    expect(converterUnidade(10, "g", "g")).toBe(10);
    expect(converterUnidade(1, "un", "kg")).toBeNull();
  });
});

describe("composição com sub-receitas", () => {
  const item = (id: number, ordem: number, extra: Partial<FichaDados["itens"][number]>) => ({
    id, ordem, quantidade: 0, observacao: null, insumo: null, sub_ficha_id: null, unidade_sub: null, ...extra,
  });
  const fichas = new Map<number, FichaDados>([
    [1, { id: 1, nome: "Molho bechamel", rendimento_qtd: 5000, rendimento_unidade: "g", itens: [
      item(10, 0, { quantidade: 4000, insumo: { nome: "Leite", unidade: "g" } }),
      item(11, 1, { quantidade: 250, insumo: { nome: "Farinha", unidade: "g" } }),
    ] }],
    [2, { id: 2, nome: "Arroz de polvo", rendimento_qtd: 418, rendimento_unidade: "g", itens: [
      item(21, 1, { quantidade: 180, insumo: { nome: "Arroz", unidade: "g" } }),
      item(20, 0, { quantidade: 0.1, sub_ficha_id: 1, unidade_sub: "kg", observacao: "quente" }),
    ] }],
    [3, { id: 3, nome: "A", rendimento_qtd: 100, rendimento_unidade: "g", itens: [
      item(30, 0, { quantidade: 10, sub_ficha_id: 4, unidade_sub: "g" }),
    ] }],
    [4, { id: 4, nome: "B", rendimento_qtd: 100, rendimento_unidade: "g", itens: [
      item(40, 0, { quantidade: 10, sub_ficha_id: 3, unidade_sub: "g" }),
    ] }],
    [5, { id: 5, nome: "Usa sem rendimento", rendimento_qtd: 1, rendimento_unidade: "un", itens: [
      item(50, 0, { quantidade: 1, sub_ficha_id: 6, unidade_sub: "g" }),
      item(51, 1, { quantidade: 1, sub_ficha_id: 1, unidade_sub: "un" }),
      item(52, 2, { quantidade: 1, sub_ficha_id: 99, unidade_sub: "g" }),
    ] }],
    [6, { id: 6, nome: "Sem rendimento", rendimento_qtd: 0, rendimento_unidade: "g", itens: [] }],
  ]);

  test("segue a ordem e abre a sub-receita na proporção usada (convertendo kg → g)", () => {
    const [bechamel, arroz] = montarComposicao(2, fichas);
    expect(arroz.nome).toBe("Arroz");
    expect(bechamel.nome).toBe("Molho bechamel");
    expect(bechamel.observacao).toBe("quente");
    expect(bechamel.fatorSub).toBeCloseTo(100 / 5000);
    expect(bechamel.subItens.map((i) => [i.nome, i.quantidade])).toEqual([["Leite", 4000], ["Farinha", 250]]);
    expect(bechamel.subItens[0].chave).toBe("20.10");
  });

  test("para na referência circular", () => {
    const [b] = montarComposicao(3, fichas);
    const [volta] = b.subItens;
    expect(volta.nome).toBe("A");
    expect(volta.aviso).toMatch(/circular/);
    expect(volta.subItens).toEqual([]);
  });

  test("avisa quando não dá para abrir", () => {
    const [semRendimento, unidadeErrada, inexistente] = montarComposicao(5, fichas);
    expect(semRendimento.aviso).toMatch(/sem rendimento/);
    expect(unidadeErrada.aviso).toMatch(/incompatível/);
    expect(inexistente.aviso).toMatch(/indisponível/);
  });

  test("ficha que não foi carregada não quebra", () => {
    expect(montarComposicao(404, fichas)).toEqual([]);
  });
});

describe("busca", () => {
  test("ignora acento, maiúscula e ordem das palavras", () => {
    expect(normalizar("  Camarão  à Beurre ")).toBe("camarao a beurre");
    expect(combina("Arroz de polvo mediterrâneo", "POLVO arroz")).toBe(true);
    expect(combina("Filé mignon ao poivre", "file")).toBe(true);
    expect(combina("Molho bechamel", "roti")).toBe(false);
    expect(combina("Qualquer", "")).toBe(true);
  });
});
