// Papéis do app antigo. Admin master, admin e líder cadastram e editam (e gerenciam
// usuários); usuário só consulta. Ninguém cria nem altera um papel acima do seu:
// admin master cria qualquer um, admin cria líder/usuário, líder cria só usuário.

export type Papel = "admin_master" | "admin" | "lider" | "usuario";

export const PAPEIS: Record<Papel, string> = {
  admin_master: "Admin master",
  admin: "Admin",
  lider: "Líder",
  usuario: "Usuário",
};

export const ORDEM: Papel[] = ["admin_master", "admin", "lider", "usuario"];

export function papelValido(valor: unknown): valor is Papel {
  return typeof valor === "string" && valor in PAPEIS;
}

export function podeEditar(papel: Papel): boolean {
  return papel !== "usuario";
}

/** Papéis que quem tem `papel` pode atribuir a outras pessoas. */
export function papeisPermitidos(papel: Papel): Papel[] {
  if (papel === "admin_master") return [...ORDEM];
  if (papel === "admin") return ["lider", "usuario"];
  if (papel === "lider") return ["usuario"];
  return [];
}

/** Pode criar, editar, trocar a senha ou desativar alguém com o papel `alvo`? */
export function podeGerenciar(papel: Papel, alvo: Papel): boolean {
  return papeisPermitidos(papel).includes(alvo);
}
