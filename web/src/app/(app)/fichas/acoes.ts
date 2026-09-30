"use server";

import { revalidatePath } from "next/cache";
import { chamarRpc } from "@/lib/cadastro";

function atualizarTelas(id?: number) {
  revalidatePath("/fichas");
  revalidatePath("/");
  if (id) revalidatePath(`/fichas/${id}`);
}

/** Grava a ficha inteira (dados, ingredientes, preparo, alérgenos) numa operação só. */
export async function salvarFicha(ficha: Record<string, unknown>): Promise<{ erro: string | null; id: number | null }> {
  const { dados, erro } = await chamarRpc<number>("salvar_ficha", { p: ficha });
  if (erro || dados === null) return { erro: erro ?? "Não foi possível salvar.", id: null };
  atualizarTelas(dados);
  return { erro: null, id: dados };
}

export async function definirFichaAtiva(id: number, ativa: boolean): Promise<string | null> {
  const { erro } = await chamarRpc("definir_ficha_ativa", { p_id: id, p_ativa: ativa });
  if (!erro) atualizarTelas(id);
  return erro;
}

export async function verificarFicha(id: number): Promise<string | null> {
  const { erro } = await chamarRpc("verificar_ficha", { p_id: id });
  if (!erro) atualizarTelas(id);
  return erro;
}
