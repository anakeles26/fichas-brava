"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** Uma linha por login no log de acessos. Falha aqui nunca impede a entrada. */
async function registrarAcesso(supabase: Awaited<ReturnType<typeof criarClienteServidor>>) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: perfil } = await supabase.from("perfis").select("empresa_id").eq("id", user.id).eq("ativo", true).maybeSingle();
    if (perfil) await supabase.from("acessos").insert({ empresa_id: perfil.empresa_id, usuario_id: user.id });
  } catch {
    // o acesso simplesmente não fica registrado
  }
}

export type EstadoLogin = { erro: string | null };

/** Só aceita voltar para uma página do próprio app ("/fichas/3"), nunca para outro site. */
function destinoSeguro(proximo: FormDataEntryValue | null): string {
  const caminho = typeof proximo === "string" ? proximo : "";
  return caminho.startsWith("/") && !caminho.startsWith("//") ? caminho : "/";
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
  await registrarAcesso(supabase);
  redirect(destinoSeguro(dados.get("proximo")));
}
