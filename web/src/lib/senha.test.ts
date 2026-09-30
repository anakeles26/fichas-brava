import { describe, expect, it } from "vitest";
import { gerarSenhaProvisoria, senhaValida } from "./senha";

describe("senhaValida", () => {
  it("exige 6 caracteres, letra e número/especial", () => {
    expect(senhaValida("abc12")).toBe(false);
    expect(senhaValida("abcdefg")).toBe(false);
    expect(senhaValida("1234567")).toBe(false);
    expect(senhaValida("abc123")).toBe(true);
  });
  it("a senha provisória gerada é válida", () => {
    for (let i = 0; i < 50; i++) expect(senhaValida(gerarSenhaProvisoria())).toBe(true);
  });
});
