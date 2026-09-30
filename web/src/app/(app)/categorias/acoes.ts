"use server";

import { revalidatePath } from "next/cache";
import { chamarRpc, type Resultado } from "@/lib/cadastro";

function atualizarTelas() {
  // Categorias aparecem nos filtros de fichas e insumos também.
  for (const caminho of ["/categorias", "/insumos", "/fichas"]) revalidatePath(caminho);
}

export async function salvarCategoria(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const id = dados.get("id");
  const nome = String(dados.get("nome") ?? "").trim();
  const { erro } = await chamarRpc("salvar_categoria", {
    p: { id: id ? Number(id) : null, tipo: dados.get("tipo"), nome },
  });
  if (erro) return { erro, ok: null };
  atualizarTelas();
  return { erro: null, ok: id ? `Categoria renomeada para "${nome}".` : `Categoria "${nome}" criada.` };
}

export async function excluirCategoria(id: number): Promise<Resultado> {
  const { erro } = await chamarRpc("excluir_categoria", { p_id: id });
  if (erro) return { erro, ok: null };
  atualizarTelas();
  return { erro: null, ok: "Categoria removida." };
}
