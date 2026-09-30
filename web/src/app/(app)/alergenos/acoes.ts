"use server";

import { revalidatePath } from "next/cache";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { gestorLogado, registrarLog } from "@/lib/usuarios";

export type ResultadoAlergeno = { erro: string | null; ok: string | null };

const SO_MASTER = "Só o Admin master altera o catálogo de alérgenos.";

// O catálogo é global (vale para todas as casas), então só o Admin master grava.
async function master() {
  const g = await gestorLogado();
  return g?.papel === "admin_master" ? g : null;
}

export async function criarAlergeno(_anterior: ResultadoAlergeno, dados: FormData): Promise<ResultadoAlergeno> {
  const gestor = await master();
  if (!gestor) return { erro: SO_MASTER, ok: null };
  const nome = String(dados.get("nome") ?? "").trim();
  const icone = String(dados.get("icone") ?? "").trim() || null;
  const descricao = String(dados.get("descricao") ?? "").trim() || null;
  if (!nome) return { erro: "Informe o nome.", ok: null };

  const { error } = await criarClienteAdmin().from("alergenos").insert({ nome, icone, descricao });
  if (error) return { erro: error.code === "23505" ? "Esse alérgeno já está cadastrado." : "Não foi possível adicionar.", ok: null };
  await registrarLog(gestor, "criar", "alergeno", `Alérgeno '${nome}'`);
  revalidatePath("/alergenos");
  return { erro: null, ok: `Alérgeno "${nome}" adicionado.` };
}

export async function excluirAlergeno(id: number): Promise<ResultadoAlergeno> {
  const gestor = await master();
  if (!gestor) return { erro: SO_MASTER, ok: null };
  const admin = criarClienteAdmin();
  const { data: alergeno } = await admin.from("alergenos").select("nome").eq("id", id).maybeSingle();
  if (!alergeno) return { erro: "Alérgeno não encontrado.", ok: null };

  const { error } = await admin.from("alergenos").delete().eq("id", id);
  if (error) return { erro: "Não foi possível excluir.", ok: null };
  await registrarLog(gestor, "excluir", "alergeno", `Alérgeno '${alergeno.nome}'`);
  revalidatePath("/alergenos");
  return { erro: null, ok: "Alérgeno excluído." };
}
