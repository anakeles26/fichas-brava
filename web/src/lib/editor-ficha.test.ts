import { describe, expect, test } from "vitest";
import { sugerirAlergenos } from "./alergenos";
import { type DadosEditor, lerNumero, montarFicha, mover, type OpcaoFicha, type OpcaoInsumo, paraEditor, unidadesCompativeis } from "./editor-ficha";

const insumos = new Map<number, OpcaoInsumo>([
  [1, { id: 1, nome: "Leite integral", unidade: "g" }],
  [2, { id: 2, nome: "Ovos", unidade: "un" }],
  [3, { id: 3, nome: "Azeite", unidade: "ml" }],
]);
const fichas = new Map<number, OpcaoFicha>([[10, { id: 10, nome: "Molho bechamel", rendimento_unidade: "g" }]]);

const base: DadosEditor = {
  id: null,
  nome: "  Risoto  ",
  categoriaId: "4",
  rendimento: "418",
  rendimentoUnidade: "g",
  validadeCongelado: "",
  validadeRefrigerado: "2",
  validadeAmbiente: "",
  observacoes: "  ",
  itens: [
    { chave: "a", tipo: "insumo", refId: 1, quantidade: "1,5", unidade: "kg", observacao: " quente " },
    { chave: "b", tipo: "sub", refId: 10, quantidade: "100", unidade: "g", observacao: "" },
    { chave: "c", tipo: "insumo", refId: 2, quantidade: "0", unidade: "un", observacao: "" },
  ],
  passos: [
    { chave: "p1", descricao: " Refogar ", tempo: "5" },
    { chave: "p2", descricao: "   ", tempo: "" },
    { chave: "p3", descricao: "Servir", tempo: "abc" },
  ],
  alergenoIds: [2, 1, 2],
};

describe("editor de ficha", () => {
  test("unidades que cada item aceita", () => {
    expect(unidadesCompativeis("g")).toEqual(["g", "kg"]);
    expect(unidadesCompativeis("l")).toEqual(["ml", "l"]);
    expect(unidadesCompativeis("un")).toEqual(["un"]);
  });

  test("lê números com vírgula", () => {
    expect([lerNumero("1,5"), lerNumero(" 2 "), lerNumero(""), Number.isNaN(lerNumero("x"))]).toEqual([1.5, 2, null, true]);
  });

  test("monta a ficha convertendo para a unidade do insumo e limpando o que está vazio", () => {
    const r = montarFicha(base, insumos, fichas);
    expect(r).toEqual({
      ficha: {
        id: null,
        nome: "Risoto",
        categoria_id: 4,
        rendimento_qtd: 418,
        rendimento_unidade: "g",
        validade_congelado_dias: null,
        validade_refrigerado_dias: 2,
        validade_ambiente_dias: null,
        observacoes: null,
        itens: [
          { insumo_id: 1, quantidade: 1500, observacao: "quente" },
          { sub_ficha_id: 10, quantidade: 100, unidade_sub: "g", observacao: null },
          { insumo_id: 2, quantidade: 0, observacao: null },
        ],
        passos: [
          { descricao: "Refogar", tempo_min: 5 },
          { descricao: "Servir", tempo_min: null },
        ],
        alergeno_ids: [2, 1],
      },
    });
  });

  test("junta todos os erros para mostrar de uma vez", () => {
    const r = montarFicha(
      {
        ...base,
        id: 10,
        nome: " ",
        rendimento: "0",
        validadeAmbiente: "1,5",
        itens: [
          { chave: "a", tipo: "insumo", refId: null, quantidade: "1", unidade: "g", observacao: "" },
          { chave: "b", tipo: "insumo", refId: 1, quantidade: "-2", unidade: "g", observacao: "" },
          { chave: "c", tipo: "insumo", refId: 3, quantidade: "1", unidade: "kg", observacao: "" },
          { chave: "d", tipo: "sub", refId: 10, quantidade: "1", unidade: "g", observacao: "" },
        ],
      },
      insumos,
      fichas,
    );
    expect(r).toEqual({
      erros: [
        "Informe o nome da ficha.",
        "O rendimento precisa ser maior que zero.",
        "Ingrediente 1: escolha o insumo ou a sub-receita.",
        'Ingrediente 2: quantidade inválida (use 0 para "a gosto").',
        'Ingrediente 3: "kg" não combina com a unidade de "Azeite" (ml).',
        "Ingrediente 4: a ficha não pode usar ela mesma como sub-receita.",
        "Validade (ambiente) precisa ser um número inteiro de dias.",
      ],
    });
  });

  test("ficha gravada vira formulário e volta igual ao salvar (ida e volta)", () => {
    const gravada = {
      id: 7, nome: "Arroz", categoria_id: 4, rendimento_qtd: 418.5, rendimento_unidade: "g",
      validade_congelado_dias: null, validade_refrigerado_dias: 2, validade_ambiente_dias: null, observacoes: null,
      itens: [
        { insumo_id: 1, sub_ficha_id: null, quantidade: 150, unidade_sub: null, observacao: "Peso líquido: 130 g" },
        { insumo_id: null, sub_ficha_id: 10, quantidade: 10, unidade_sub: "g", observacao: null },
      ],
      passos: [{ descricao: "Cozinhar", tempo_min: 15 }],
      ficha_alergenos: [{ alergeno_id: 2 }, { alergeno_id: 1 }],
    };
    const dados = paraEditor(gravada, insumos);
    expect(dados.rendimento).toBe("418,5");
    expect(dados.itens.map((i) => [i.tipo, i.refId, i.quantidade, i.unidade])).toEqual([
      ["insumo", 1, "150", "g"],
      ["sub", 10, "10", "g"],
    ]);
    const r = montarFicha(dados, insumos, fichas);
    expect("ficha" in r && r.ficha).toMatchObject({
      id: 7,
      rendimento_qtd: 418.5,
      itens: [
        { insumo_id: 1, quantidade: 150, observacao: "Peso líquido: 130 g" },
        { sub_ficha_id: 10, quantidade: 10, unidade_sub: "g", observacao: null },
      ],
      passos: [{ descricao: "Cozinhar", tempo_min: 15 }],
      alergeno_ids: [1, 2],
    });
  });

  test("ficha nova começa vazia e não pode ser salva assim", () => {
    const r = montarFicha(paraEditor(null, insumos), insumos, fichas);
    expect(r).toEqual({ erros: ["Informe o nome da ficha.", "O rendimento precisa ser maior que zero."] });
  });

  test("move linhas para cima e para baixo sem sair da lista", () => {
    expect(mover(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(mover(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(mover(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });
});

describe("sugestão de alérgenos", () => {
  test("pelos ingredientes, sem os falsos positivos", () => {
    expect(sugerirAlergenos(["Farinha de trigo", "Leite de coco", "Doce de leite", "Couve-manteiga (crispy)", "Camarão", "Shoyu"])).toEqual([
      "Crustáceos",
      "Glúten",
      "Lactose",
      "Leite",
      "Soja",
    ]);
    expect(sugerirAlergenos(["Leite de coco", "Couve-manteiga (crispy)", "Pão italiano"])).toEqual(["Glúten"]);
  });

  test("herda os alérgenos das sub-receitas", () => {
    expect(sugerirAlergenos(["Sirigado"], ["Glúten", "Lactose"])).toEqual(["Glúten", "Lactose", "Peixe"]);
  });
});
