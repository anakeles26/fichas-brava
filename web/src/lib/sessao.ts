import "server-only";

import { cache } from "react";
import { criarClienteServidor } from "./supabase/servidor";

export type Perfil = { nome: string; papel: "gestao" | "cozinha"; empresa: string };

type LinhaPerfil = { nome: string; papel: "gestao" | "cozinha"; empresa: { nome: string } | null };

/**
 * Perfil de quem está logado, com o nome da casa. null quando o login existe no Supabase
 * Auth mas o perfil está inativo ou não existe — nesse caso a RLS já não libera dado
 * nenhum, e a tela explica o motivo em vez de mostrar uma lista vazia.
 */
// cache(): o layout e a página pedem o perfil no mesmo acesso — uma consulta só.
export const perfilLogado = cache(async (): Promise<Perfil | null> => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("perfis")
    .select("nome, papel, empresa:empresas(nome)")
    .eq("id", user.id)
    .eq("ativo", true)
    .maybeSingle<LinhaPerfil>();
  return data ? { nome: data.nome, papel: data.papel, empresa: data.empresa?.nome ?? "" } : null;
});
