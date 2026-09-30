import { describe, expect, it } from "vitest";
import { papeisPermitidos, podeEditar, podeGerenciar } from "./papeis";

describe("papéis", () => {
  it("só o usuário não edita", () => {
    expect(["admin_master", "admin", "lider", "usuario"].map((p) => podeEditar(p as never))).toEqual([true, true, true, false]);
  });
  it("ninguém atribui papel acima do seu", () => {
    expect(papeisPermitidos("admin_master")).toHaveLength(4);
    expect(papeisPermitidos("admin")).toEqual(["lider", "usuario"]);
    expect(papeisPermitidos("lider")).toEqual(["usuario"]);
    expect(papeisPermitidos("usuario")).toEqual([]);
  });
  it("admin não mexe em admin master nem em outro admin", () => {
    expect(podeGerenciar("admin", "admin_master")).toBe(false);
    expect(podeGerenciar("admin", "admin")).toBe(false);
    expect(podeGerenciar("admin", "lider")).toBe(true);
    expect(podeGerenciar("lider", "lider")).toBe(false);
  });
});
