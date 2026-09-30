import "server-only";

import { criarClienteServidor } from "./supabase/servidor";

export type Resultado = { erro: string | null; ok: string | null };
export const SEM_RESULTADO: Resultado = { erro: null, ok: null };

/**
 * Chama uma operação de gravação do banco (RPC). As mensagens de erro já vêm em português
 * das próprias funções ("Já existe um insumo com o nome ..."); erro de permissão vira texto claro.
 */
export async function chamarRpc<T = unknown>(funcao: string, args: Record<string, unknown>) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc(funcao, args);
  if (error) {
    const semPermissao = error.code === "42501" && !error.message.includes("gestão");
    return { dados: null, erro: semPermissao ? "Você não tem permissão para alterar o cadastro." : error.message };
  }
  return { dados: data as T, erro: null };
}

export type Categoria = { id: number; nome: string; tipo: "ficha" | "insumo"; uso: number };
export type Insumo = { id: number; nome: string; unidade: string; categoria_id: number | null; categoria: string | null };

/** Categorias da casa (RLS), com quantos itens usam cada uma. */
export async function listarCategorias(): Promise<Categoria[]> {
  const supabase = await criarClienteServidor();
  const [cats, insumos, fichas] = await Promise.all([
    supabase.from("categorias").select("id, nome, tipo").order("nome"),
    supabase.from("insumos").select("categoria_id").not("categoria_id", "is", null),
    supabase.from("fichas").select("categoria_id").not("categoria_id", "is", null),
  ]);
  if (cats.error || insumos.error || fichas.error) {
    throw new Error(`Erro ao listar categorias: ${(cats.error ?? insumos.error ?? fichas.error)?.message}`);
  }
  const uso = new Map<number, number>();
  for (const { categoria_id } of [...insumos.data, ...fichas.data]) uso.set(categoria_id, (uso.get(categoria_id) ?? 0) + 1);
  return cats.data.map((c) => ({ ...c, tipo: c.tipo as Categoria["tipo"], uso: uso.get(c.id) ?? 0 }));
}

export async function listarInsumos(): Promise<Insumo[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, unidade, categoria_id, categoria:categorias(nome)")
    .order("nome")
    .returns<(Omit<Insumo, "categoria"> & { categoria: { nome: string } | null })[]>();
  if (error) throw new Error(`Erro ao listar insumos: ${error.message}`);
  return data.map((i) => ({ ...i, categoria: i.categoria?.nome ?? null }));
}
