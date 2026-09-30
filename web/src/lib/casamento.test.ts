import { describe, expect, test } from "vitest";
import { casar, distancia, indexar, semelhanca, unidadeSugerida } from "./casamento";

const indice = indexar({
  // (tipos já filtrados como em montarPrevia)
  apelidos: [
    { tipo: "ingrediente", chave: "PARMESSAO", insumo_id: 1, ficha_id: null },
    { tipo: "ingrediente", chave: "MOLHO POMORORO", insumo_id: null, ficha_id: 10 },
    { tipo: "ingrediente", chave: "APELIDO QUEBRADO", insumo_id: 999, ficha_id: null },
  ],
  insumos: [
    { id: 1, nome: "Parmesão" },
    { id: 2, nome: "Cebola branca" },
    { id: 3, nome: "Filé mignon" },
  ],
  fichas: [{ id: 10, nome: "Molho pomodoro" }],
});

describe("casamento de nomes da planilha", () => {
  test("apelido aprendido vence", () => {
    expect(casar("PARMESSAO", indice)).toEqual({ situacao: "reconhecido", alvo: { tipo: "insumo", id: 1, nome: "Parmesão" }, por: "apelido" });
    expect(casar("molho  pomororo", indice)).toMatchObject({ situacao: "reconhecido", alvo: { tipo: "ficha", id: 10 } });
  });

  test("nome igual ao cadastro (sem acento e maiúsculas) é reconhecido", () => {
    expect(casar("CEBOLA BRANCA", indice)).toMatchObject({ situacao: "reconhecido", alvo: { id: 2 }, por: "nome" });
    expect(casar("MOLHO POMODORO", indice)).toMatchObject({ situacao: "reconhecido", alvo: { tipo: "ficha", id: 10 } });
  });

  test("grafia parecida gera sugestão; nome sem nada parecido é novo", () => {
    expect(casar("FILE MINGON", indice)).toMatchObject({ situacao: "parecido", sugestao: { id: 3 } });
    expect(casar("PAREMESSAO", indice)).toMatchObject({ situacao: "parecido", sugestao: { id: 1 } });
    expect(casar("GELATINA", indice)).toEqual({ situacao: "novo" });
  });

  test("apelido que aponta para algo que não existe mais é ignorado", () => {
    expect(casar("APELIDO QUEBRADO", indice)).toEqual({ situacao: "novo" });
  });

  test("distância e semelhança", () => {
    expect(distancia("PARMESAO", "PARMESSAO")).toBe(1);
    expect(semelhanca("ABC", "ABC")).toBe(1);
    expect(semelhanca("", "")).toBe(1);
  });

  test("insumo novo: ovos em unidade, o resto em gramas", () => {
    expect([unidadeSugerida("OVOS"), unidadeSugerida("OVO(GEMA)"), unidadeSugerida("OVAS DE PEIXE"), unidadeSugerida("FARINHA")]).toEqual([
      "un", "un", "g", "g",
    ]);
  });
});
