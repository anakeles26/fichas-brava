"use server";

import { revalidatePath } from "next/cache";
import { chamarRpc } from "@/lib/cadastro";
import type { Apelido } from "@/lib/casamento";
import { abrirPlanilha, linhasDaAba } from "@/lib/excel";
import { montarPrevia, type Previa } from "@/lib/importacao";
import { AbaForaDoModelo, type FichaPlanilha, lerAba } from "@/lib/leitor-ficha";
import { criarClienteServidor } from "@/lib/supabase/servidor";

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

export type LeituraChef = { erro: string | null; previa: Previa | null };

/** 1º passo: lê todas as abas e casa os nomes com o cadastro. Nada é gravado. */
export async function lerPlanilhaChef(_anterior: LeituraChef, dados: FormData): Promise<LeituraChef> {
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha (.xlsx) do chef.", previa: null };
  if (!arquivo.name.toLowerCase().endsWith(".xlsx")) return { erro: "A planilha precisa ser .xlsx.", previa: null };
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais (máximo 10 MB).", previa: null };

  let livro;
  try {
    livro = await abrirPlanilha(await arquivo.arrayBuffer());
  } catch {
    return { erro: "Não consegui abrir o arquivo. Confira se é uma planilha .xlsx válida.", previa: null };
  }

  const abas: FichaPlanilha[] = [];
  const foraDoModelo: string[] = [];
  for (const aba of livro.worksheets) {
    try {
      abas.push(lerAba(linhasDaAba(aba), aba.name));
    } catch (e) {
      if (!(e instanceof AbaForaDoModelo)) throw e;
      foraDoModelo.push(aba.name);
    }
  }
  if (abas.length === 0) {
    return { erro: 'Nenhuma aba no modelo "FICHA TÉCNICA OPERACIONAL" foi encontrada nesse arquivo.', previa: null };
  }

  const supabase = await criarClienteServidor();
  const [apelidos, insumos, fichas] = await Promise.all([
    supabase.from("apelidos").select("tipo, chave, insumo_id, ficha_id").returns<Apelido[]>(),
    supabase.from("insumos").select("id, nome"),
    supabase.from("fichas").select("id, nome"),
  ]);
  if (apelidos.error || insumos.error || fichas.error) {
    return { erro: "Não foi possível consultar o cadastro. Tente novamente.", previa: null };
  }
  return {
    erro: null,
    previa: montarPrevia(arquivo.name, abas, foraDoModelo, { apelidos: apelidos.data, insumos: insumos.data, fichas: fichas.data }),
  };
}

export type ResultadoImportacao = {
  fichas_criadas: number;
  fichas_substituidas: number;
  fichas_puladas: number;
  insumos_criados: number;
  apelidos_criados: number;
  fichas: Record<string, number>; // ref -> id
};

/** 2º passo: grava a prévia confirmada (tudo ou nada, no banco). */
export async function importarPlanilhaChef(pedido: Record<string, unknown>): Promise<{ erro: string | null; resultado: ResultadoImportacao | null }> {
  const { dados, erro } = await chamarRpc<ResultadoImportacao>("importar_planilha", { p: pedido });
  if (erro || !dados) return { erro: erro ?? "Não foi possível importar.", resultado: null };
  for (const caminho of ["/fichas", "/insumos", "/"]) revalidatePath(caminho);
  return { erro: null, resultado: dados };
}
