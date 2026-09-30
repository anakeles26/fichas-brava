"use server";

import { revalidatePath } from "next/cache";
import { chamarRpc, type Resultado } from "@/lib/cadastro";
import { abrirPlanilha, linhasDaAba } from "@/lib/excel";
import { type LinhaInsumo, lerCsv, lerLinhasInsumos } from "@/lib/planilha-insumos";

const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5 MB: planilha de insumos é pequena

function atualizarTelas() {
  for (const caminho of ["/insumos", "/categorias", "/"]) revalidatePath(caminho);
}

function paraId(valor: FormDataEntryValue | null): number | null {
  return valor ? Number(valor) : null;
}

export async function salvarInsumo(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const id = paraId(dados.get("id"));
  const nome = String(dados.get("nome") ?? "").trim();
  const { erro } = await chamarRpc("salvar_insumo", {
    p: { id, nome, unidade: dados.get("unidade"), categoria_id: paraId(dados.get("categoria_id")) },
  });
  if (erro) return { erro, ok: null };
  atualizarTelas();
  return { erro: null, ok: id ? "Insumo atualizado." : `Insumo "${nome}" criado.` };
}

export async function mudarCategoria(ids: number[], categoriaId: number | null): Promise<Resultado> {
  if (ids.length === 0) return { erro: "Selecione pelo menos um insumo.", ok: null };
  const { dados, erro } = await chamarRpc<number>("mudar_categoria_insumos", { p_ids: ids, p_categoria_id: categoriaId });
  if (erro) return { erro, ok: null };
  atualizarTelas();
  return { erro: null, ok: `${dados} insumo(s) movido(s).` };
}

export type LeituraPlanilha = { erro: string | null; arquivo: string; linhas: LinhaInsumo[] };

/** 1º passo: lê o arquivo e devolve as linhas para a prévia (nada é gravado). */
export async function lerPlanilhaInsumos(_anterior: LeituraPlanilha, dados: FormData): Promise<LeituraPlanilha> {
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha um arquivo .xlsx ou .csv.", arquivo: "", linhas: [] };
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais (máximo 5 MB).", arquivo: arquivo.name, linhas: [] };

  try {
    const bruto = arquivo.name.toLowerCase().endsWith(".csv")
      ? lerCsv(await arquivo.text())
      : linhasDaAba((await abrirPlanilha(await arquivo.arrayBuffer())).worksheets[0]);
    const r = lerLinhasInsumos(bruto);
    return "erro" in r ? { erro: r.erro, arquivo: arquivo.name, linhas: [] } : { erro: null, arquivo: arquivo.name, linhas: r.linhas };
  } catch {
    return { erro: "Não consegui ler o arquivo. Confira se é um .xlsx ou .csv válido.", arquivo: arquivo.name, linhas: [] };
  }
}

/** 2º passo: grava as linhas confirmadas na prévia. */
export async function importarInsumos(linhas: LinhaInsumo[]): Promise<Resultado> {
  const { dados, erro } = await chamarRpc<{ criados: number; ignorados: number; categorias_criadas: string[] }>(
    "importar_insumos",
    { p_linhas: linhas },
  );
  if (erro || !dados) return { erro: erro ?? "Falha ao importar.", ok: null };
  atualizarTelas();
  const categorias = dados.categorias_criadas.length ? ` Categorias criadas: ${dados.categorias_criadas.join(", ")}.` : "";
  return { erro: null, ok: `${dados.criados} insumo(s) importado(s). ${dados.ignorados} já existiam e foram ignorados.${categorias}` };
}
