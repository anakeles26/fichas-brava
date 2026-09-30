import "server-only";

import { criarClienteServidor } from "./supabase/servidor";

export type Registro = { id: number; acao: string; entidade: string; descricao: string; criadoEm: string; quem: string };

export const ROTULO_ENTIDADE: Record<string, string> = {
  ficha: "ficha",
  insumo: "insumo",
  categoria: "categoria",
  planilha: "planilha",
  usuario: "usuário",
  alergeno: "alérgeno",
};

/** Últimos registros da casa (a RLS só libera para quem pode editar). */
export async function listarAuditoria(limite = 200): Promise<Registro[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("log_auditoria")
    .select("id, acao, entidade, descricao, criado_em, autor:perfis(nome)")
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite)
    .returns<{ id: number; acao: string; entidade: string; descricao: string; criado_em: string; autor: { nome: string } | null }[]>();
  if (error) throw new Error(`Erro ao listar a auditoria: ${error.message}`);
  return data.map((r) => ({
    id: r.id,
    acao: r.acao,
    entidade: r.entidade,
    descricao: r.descricao,
    criadoEm: r.criado_em,
    quem: r.autor?.nome ?? "—",
  }));
}
