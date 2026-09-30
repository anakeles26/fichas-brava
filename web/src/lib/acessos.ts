import "server-only";

import type { Papel } from "./papeis";
import { criarClienteServidor } from "./supabase/servidor";

export type Acesso = { id: number; usuarioId: string; nome: string; papel: Papel; em: string };
export type ResumoUsuario = { id: string; nome: string; papel: Papel; ativo: boolean; ultimo: string | null; entradas: number };

/** Acessos da casa dos últimos `dias` dias (a RLS só libera para quem pode editar) e o resumo por usuário. */
export async function listarAcessos(dias: number) {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const supabase = await criarClienteServidor();
  const [perfis, acessos] = await Promise.all([
    supabase.from("perfis").select("id, nome, papel, ativo").order("nome"),
    supabase.from("acessos").select("id, usuario_id, criado_em").gte("criado_em", desde.toISOString()).order("criado_em", { ascending: false }).limit(1000),
  ]);
  if (perfis.error || acessos.error) throw new Error(`Erro ao listar acessos: ${(perfis.error ?? acessos.error)?.message}`);

  const porId = new Map(perfis.data.map((p) => [p.id as string, p]));
  const historico: Acesso[] = acessos.data.map((a) => {
    const p = porId.get(a.usuario_id as string);
    return { id: a.id as number, usuarioId: a.usuario_id as string, nome: p?.nome ?? "—", papel: (p?.papel ?? "usuario") as Papel, em: a.criado_em as string };
  });
  const resumo: ResumoUsuario[] = perfis.data.map((p) => {
    const dele = historico.filter((a) => a.usuarioId === p.id);
    return { id: p.id as string, nome: p.nome as string, papel: p.papel as Papel, ativo: p.ativo as boolean, ultimo: dele[0]?.em ?? null, entradas: dele.length };
  });
  return { historico, resumo };
}
