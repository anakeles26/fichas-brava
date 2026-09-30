import "server-only";

import { criarClienteAdmin } from "./supabase/admin";
import { criarClienteServidor } from "./supabase/servidor";

export type Papel = "gestao" | "cozinha";
export const PAPEIS: Record<Papel, string> = { gestao: "Gestão", cozinha: "Cozinha" };

export type Usuario = { id: string; nome: string; email: string; papel: Papel; ativo: boolean; eu: boolean };

/** Quem está logado, já confirmado como gestão ativa. null = não pode gerenciar usuários. */
export async function gestorLogado() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("perfis")
    .select("id, empresa_id, nome, papel")
    .eq("id", user.id)
    .eq("ativo", true)
    .eq("papel", "gestao")
    .maybeSingle();
  return data ? { id: data.id as string, empresaId: data.empresa_id as number, nome: data.nome as string } : null;
}

/** Usuários da casa do gestor (RLS já limita à casa) com o e-mail do login. */
export async function listarUsuarios(eu: string): Promise<Usuario[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("perfis").select("id, nome, papel, ativo").order("nome");
  if (error) throw new Error(`Erro ao listar usuários: ${error.message}`);

  const emails = new Map<string, string>();
  const admin = criarClienteAdmin();
  for (let pagina = 1; ; pagina++) {
    const { data: lote, error: erroLogins } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (erroLogins) throw new Error(`Erro ao ler os logins: ${erroLogins.message}`);
    for (const u of lote.users) emails.set(u.id, u.email ?? "");
    if (lote.users.length < 200) break;
  }
  return data.map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    papel: p.papel as Papel,
    ativo: p.ativo as boolean,
    email: emails.get(p.id as string) ?? "",
    eu: p.id === eu,
  }));
}

/** Registra no log de auditoria (como o próprio gestor, pela RLS). Falha no log não desfaz a ação. */
export async function registrarUsuario(
  gestor: { id: string; empresaId: number },
  acao: "criar" | "editar" | "inativar" | "reativar",
  descricao: string,
) {
  const supabase = await criarClienteServidor();
  await supabase.from("log_auditoria").insert({
    empresa_id: gestor.empresaId,
    usuario_id: gestor.id,
    acao,
    entidade: "usuario",
    descricao,
  });
}
