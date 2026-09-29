"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export type EstadoLogin = { erro: string | null };

/** Só aceita voltar para uma página do próprio app ("/fichas/3"), nunca para outro site. */
function destinoSeguro(proximo: FormDataEntryValue | null): string {
  const caminho = typeof proximo === "string" ? proximo : "";
  return caminho.startsWith("/") && !caminho.startsWith("//") ? caminho : "/fichas";
}

export async function entrar(_anterior: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  const email = String(dados.get("email") ?? "").trim();
  const senha = String(dados.get("senha") ?? "");
  if (!email || !senha) return { erro: "Preencha e-mail e senha." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    // Mensagem única para e-mail inexistente ou senha errada: não revela quem tem conta.
    return { erro: error.status === 400 ? "E-mail ou senha incorretos." : "Não foi possível entrar agora. Tente novamente." };
  }
  redirect(destinoSeguro(dados.get("proximo")));
}
