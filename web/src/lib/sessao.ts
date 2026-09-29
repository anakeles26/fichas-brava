import "server-only";

import { criarClienteServidor } from "./supabase/servidor";

export type Perfil = { nome: string; papel: "gestao" | "cozinha" };

/**
 * Perfil de quem está logado. null quando o login existe no Supabase Auth mas o perfil
 * está inativo ou não existe — nesse caso a RLS já não libera dado nenhum, e a tela
 * explica o motivo em vez de mostrar uma lista vazia.
 */
export async function perfilLogado(): Promise<Perfil | null> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("perfis")
    .select("nome, papel")
    .eq("id", user.id)
    .eq("ativo", true)
    .maybeSingle<Perfil>();
  return data;
}
