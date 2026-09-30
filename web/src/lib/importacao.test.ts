import { describe, expect, test } from "vitest";
import { decisoesIniciais, montarImportacao, montarPrevia } from "./importacao";
import type { FichaPlanilha } from "./leitor-ficha";

const aba = (parcial: Partial<FichaPlanilha> & Pick<FichaPlanilha, "aba" | "produto" | "itens">): FichaPlanilha => ({
  rendimentoG: null, rendimentoTexto: "", porcoes: "1", porcaoG: "", passos: ["Misturar."], avisosPreparo: [],
  equipamentos: "", tempoCoccao: "", orientacoes: "", refrigeracao: "", ...parcial,
});

const cadastro = {
  apelidos: [{ tipo: "ingrediente" as const, chave: "PARMESSAO", insumo_id: 1, ficha_id: null }],
  insumos: [
    { id: 1, nome: "Parmesão" },
    { id: 2, nome: "Filé mignon" },
    { id: 3, nome: "Arroz arbóreo" },
  ],
  fichas: [
    { id: 10, nome: "Molho roti" },
    { id: 11, nome: "Risoto de parmesão" },
  ],
};

const ABAS = [
  aba({
    aba: "RISOTO",
    produto: "RISOTO DE PARMESÃO",
    rendimentoG: 250,
    rendimentoTexto: "250",
    itens: [
      { nome: "ARROZ ARBOREO", pesoBruto: 200, pesoLiquido: 200 },
      { nome: "PARMESSAO", pesoBruto: 20, pesoLiquido: 20 },
      { nome: "CALDO DA CASA", pesoBruto: 30, pesoLiquido: null },
    ],
  }),
  aba({
    aba: "FILE",
    produto: "FILÉ AO ROTI",
    rendimentoG: 309,
    rendimentoTexto: "309",
    orientacoes: "GLUTEM",
    refrigeracao: "48H",
    itens: [
      { nome: "FILE MINGON", pesoBruto: 140, pesoLiquido: 130 },
      { nome: "MOLHO ROTI", pesoBruto: 50, pesoLiquido: 50 },
      { nome: "CALDO DA CASA", pesoBruto: 10, pesoLiquido: 10 },
      { nome: "TRUFA NEGRA", pesoBruto: 2, pesoLiquido: 3 },
    ],
  }),
  aba({ aba: "CALDO", produto: "CALDO DA CASA", rendimentoTexto: "5 A 6 LT", itens: [{ nome: "AGUA", pesoBruto: 1000, pesoLiquido: 1000 }] }),
  aba({ aba: "TORTA", produto: "TORTA", itens: [{ nome: "OVOS", pesoBruto: null, pesoLiquido: null }] }),
];

const ctx = {
  unidadeDoInsumo: new Map([[1, "g"], [2, "kg"], [3, "g"]]),
  alergenosDaFicha: new Map([[10, ["Glúten", "Lactose"]]]),
  alergenoId: new Map([["Glúten", 1], ["Lactose", 2], ["Leite", 3]]),
  cardapio: "Executivo 8",
  incluirObservacoes: false,
};

describe("prévia da importação", () => {
  const previa = montarPrevia("FCT 8.xlsx", ABAS, ["Resumo"], cadastro);

  test("classifica cada nome e aponta a sub-receita da própria planilha", () => {
    const porChave = Object.fromEntries(previa.nomes.map((n) => [n.chave, n]));
    expect(porChave["PARMESSAO"].casamento).toMatchObject({ situacao: "reconhecido", por: "apelido" });
    expect(porChave["ARROZ ARBOREO"].casamento).toMatchObject({ situacao: "reconhecido", por: "nome" });
    expect(porChave["FILE MINGON"].casamento).toMatchObject({ situacao: "parecido", sugestao: { id: 2 } });
    expect(porChave["TRUFA NEGRA"].casamento).toEqual({ situacao: "novo" });
    expect(porChave["CALDO DA CASA"].fichaDaPlanilha).toBe("f:CALDO");
    expect(porChave["CALDO DA CASA"].usadoEm).toEqual(["Risoto de parmesão", "Filé ao roti"]);
    expect(porChave["OVOS"]).toBeUndefined(); // só aparece na aba vazia
    expect(previa.nomes[0].casamento.situacao).toBe("novo"); // novos primeiro: pedem mais atenção
  });

  test("marca ficha existente, aba vazia e avisos", () => {
    const [risoto, file, caldo, torta] = previa.fichas;
    expect(risoto.existente).toEqual({ id: 11, nome: "Risoto de parmesão", por: "nome" });
    expect(torta.vazia).toBe(true);
    expect(file.avisos).toEqual([
      "Trufa negra: peso líquido (3) maior que o bruto (2).",
      "Rendimento (309 g) diferente da soma dos ingredientes (202 g).",
    ]);
    expect(caldo.avisos[0]).toBe('Rendimento "5 A 6 LT" interpretado como 5500 g (média da faixa, 1 l ≈ 1 kg) — confira.');
    expect(previa.foraDoModelo).toEqual(["Resumo"]);
  });

  test("decisões iniciais: existente e vazia não entram; parecido usa a sugestão; novo cria", () => {
    const d = decisoesIniciais(previa);
    expect(d.fichas["f:RISOTO"]).toEqual({ importar: true, nome: "Risoto de parmesão", categoriaId: null, substituir: false });
    expect(d.fichas["f:TORTA"].importar).toBe(false);
    expect(d.nomes["FILE MINGON"]).toMatchObject({ acao: "usar", alvo: { id: 2 } });
    expect(d.nomes["TRUFA NEGRA"]).toEqual({ acao: "novo", nome: "Trufa negra", unidade: "g", categoriaId: null });
    expect(d.nomes["CALDO DA CASA"]).toEqual({ acao: "fichaDaPlanilha", ref: "f:CALDO" });
  });

  test("monta o pedido: referências, conversão para kg, apelidos, alérgenos e puladas", () => {
    const d = decisoesIniciais(previa);
    const r = montarImportacao(previa, d, ctx);
    if ("erros" in r) throw new Error(r.erros.join("; "));
    expect(r.resumo).toEqual({ criar: 2, substituir: 0, pular: 2 }); // risoto já existe (pular) + torta vazia
    const pedido = r.pedido as { novos_insumos: unknown[]; fichas: Record<string, unknown>[]; apelidos: unknown[]; puladas: number };
    expect(pedido.puladas).toBe(2);
    expect(pedido.novos_insumos).toEqual([
      { ref: "i:TRUFA NEGRA", nome: "Trufa negra", unidade: "g", categoria_id: null },
      { ref: "i:AGUA", nome: "Agua", unidade: "g", categoria_id: null }, // da aba do caldo
    ]);
    const file = pedido.fichas.find((f) => f.ref === "f:FILE")!;
    expect(file).toMatchObject({
      id: null,
      nome: "Filé ao roti",
      rendimento_qtd: 309,
      validade_refrigerado_dias: 2,
      observacoes: null,
      alergeno_ids: [1, 2], // Glúten declarado + herdados do molho roti
      itens: [
        { insumo_id: 2, quantidade: 0.14, observacao: "Peso líquido: 130 g" }, // filé cadastrado em kg
        { sub_ficha_id: 10, quantidade: 50, unidade_sub: "g", observacao: null },
        { sub_ficha_ref: "f:CALDO", quantidade: 10, unidade_sub: "g", observacao: null },
        { insumo_ref: "i:TRUFA NEGRA", quantidade: 2, observacao: "Peso líquido: 3 g" },
      ],
    });
    const caldo = pedido.fichas.find((f) => f.ref === "f:CALDO")!;
    expect(caldo.rendimento_qtd).toBe(5500); // "5 A 6 LT" → 5,5 l ≈ 5.500 g, como na primeira importação
    // Aprende só o que difere do nome cadastrado: FILE MINGON → Filé mignon (AGUA vira insumo novo "Agua": mesma chave).
    expect(pedido.apelidos).toEqual([{ tipo: "ingrediente", chave: "FILE MINGON", insumo_id: 2 }]);
  });

  test("substituir ficha existente e incluir observações", () => {
    const d = decisoesIniciais(previa);
    d.fichas["f:RISOTO"].substituir = true;
    const r = montarImportacao(previa, d, { ...ctx, incluirObservacoes: true });
    if ("erros" in r) throw new Error(r.erros.join("; "));
    expect(r.resumo).toEqual({ criar: 2, substituir: 1, pular: 1 });
    const risoto = (r.pedido.fichas as Record<string, unknown>[]).find((f) => f.ref === "f:RISOTO")!;
    expect(risoto.id).toBe(11);
    expect(risoto.observacoes).toBe("**Cardápio:** Executivo 8  \n**Porções:** 1 · **Porção:** — g");
  });

  test("erros: nome vazio, duas abas com o mesmo nome, sub-receita da planilha que não vai entrar", () => {
    const d = decisoesIniciais(previa);
    d.fichas["f:FILE"].nome = "Caldo da casa";
    d.fichas["f:CALDO"].importar = false;
    d.fichas["f:RISOTO"] = { ...d.fichas["f:RISOTO"], substituir: true, nome: " " };
    const r = montarImportacao(previa, d, ctx);
    expect(r).toEqual({
      erros: [
        'Aba "RISOTO": informe o nome da ficha.',
        '"CALDO DA CASA" usa uma ficha desta planilha que não será importada.',
      ],
    });
    d.fichas["f:CALDO"].importar = true;
    d.fichas["f:RISOTO"].nome = "Risoto";
    const r2 = montarImportacao(previa, d, ctx);
    expect(r2).toEqual({ erros: ["Duas abas viram a mesma ficha \"Caldo da casa\" (FILE e CALDO)."] });
  });

  test("reconhece o prato pelo apelido ou por nome parecido, e aprende o nome da planilha", () => {
    const abas = [
      aba({ aba: "A", produto: "FILE MINGNO COM RISOTO", rendimentoG: 10, rendimentoTexto: "10", itens: [{ nome: "PARMESSAO", pesoBruto: 10, pesoLiquido: 10 }] }),
      aba({ aba: "B", produto: "RISOTO DE PARMESAO.", rendimentoG: 10, rendimentoTexto: "10", itens: [{ nome: "PARMESSAO", pesoBruto: 10, pesoLiquido: 10 }] }),
      aba({ aba: "C", produto: "SOPA NOVA DO CHEF", rendimentoG: 10, rendimentoTexto: "10", itens: [{ nome: "PARMESSAO", pesoBruto: 10, pesoLiquido: 10 }] }),
    ];
    const comApelido = { ...cadastro, apelidos: [...cadastro.apelidos, { tipo: "prato" as const, chave: "FILE MINGNO COM RISOTO", insumo_id: null, ficha_id: 12 }], fichas: [...cadastro.fichas, { id: 12, nome: "Filé mignon com risoto" }] };
    const p = montarPrevia("x.xlsx", abas, [], comApelido);
    expect(p.fichas.map((f) => [f.nomeSugerido, f.existente?.por ?? null])).toEqual([
      ["Filé mignon com risoto", "apelido"],
      ["Risoto de parmesão", "parecido"],
      ["Sopa nova do chef", null],
    ]);
    expect(p.fichas[1].avisos).toContain('Parece ser a ficha "Risoto de parmesão" — confira antes de importar.');

    const d = decisoesIniciais(p);
    d.fichas["f:A"].substituir = true;
    d.fichas["f:C"].nome = "Sopa do chef";
    const r = montarImportacao(p, d, ctx);
    if ("erros" in r) throw new Error(r.erros.join("; "));
    expect(r.resumo).toEqual({ criar: 1, substituir: 1, pular: 1 });
    // PARMESSAO e o prato A já tinham apelido → não reenvia; C teve o nome corrigido → aprende.
    expect(r.pedido.apelidos).toEqual([{ tipo: "prato", chave: "SOPA NOVA DO CHEF", ficha_ref: "f:C" }]);
  });

  test("caso ABACAXI: a mesma palavra é o prato da aba e um ingrediente, sem virar auto-referência", () => {
    const c = {
      apelidos: [{ tipo: "prato" as const, chave: "ABACAXI", insumo_id: null, ficha_id: 20 }],
      insumos: [{ id: 5, nome: "Abacaxi" }, { id: 6, nome: "Açúcar" }],
      fichas: [{ id: 20, nome: "Abacaxi caramelizado" }],
    };
    const abas = [
      aba({ aba: "ABACAXI", produto: "ABACAXI", rendimentoG: 1540, rendimentoTexto: "1540", itens: [
        { nome: "ABACAXI", pesoBruto: 1390, pesoLiquido: 1390 },
        { nome: "AÇUCAR", pesoBruto: 150, pesoLiquido: 150 },
      ] }),
    ];
    const p = montarPrevia("x.xlsx", abas, [], c);
    expect(p.fichas[0].existente).toMatchObject({ id: 20, por: "apelido" }); // o prato
    expect(p.nomes.find((n) => n.chave === "ABACAXI")?.casamento).toMatchObject({ situacao: "reconhecido", alvo: { tipo: "insumo", id: 5 } }); // a fruta
    const d = decisoesIniciais(p);
    d.fichas["f:ABACAXI"].substituir = true;
    const r = montarImportacao(p, d, ctx);
    if ("erros" in r) throw new Error(r.erros.join("; "));
    expect((r.pedido.fichas as { itens: unknown[] }[])[0].itens[0]).toEqual({ insumo_id: 5, quantidade: 1390, observacao: null });

    // E se alguém apontar o ingrediente para a própria ficha, a prévia avisa (antes do banco recusar).
    d.nomes["ABACAXI"] = { acao: "usar", alvo: { tipo: "ficha", id: 20, nome: "Abacaxi caramelizado" } };
    expect(montarImportacao(p, d, ctx)).toEqual({
      erros: ['"Abacaxi caramelizado": o ingrediente "ABACAXI" aponta para a própria ficha — escolha outro item para ele.'],
    });
  });
});

