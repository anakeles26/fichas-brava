"use server";

import { criarClienteServidor } from "@/lib/supabase/servidor";

export type EstadoSenha = { erro: string | null; ok: boolean };

// Mesma regra do app Streamlit (src/fichabase/senha.py): 6+ caracteres, com pelo menos
// uma letra e um número ou caractere especial.
function senhaValida(senha: string): boolean {
  return senha.length >= 6 && /\p{L}/u.test(senha) && /[^\p{L}]/u.test(senha);
}

export async function trocarSenha(_anterior: EstadoSenha, dados: FormData): Promise<EstadoSenha> {
  const nova = String(dados.get("nova") ?? "");
  const confirmacao = String(dados.get("confirmacao") ?? "");
  if (nova !== confirmacao) return { erro: "As senhas não coincidem.", ok: false };
  if (!senhaValida(nova)) {
    return { erro: "A senha precisa ter no mínimo 6 caracteres, com pelo menos 1 letra e 1 número ou caractere especial.", ok: false };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) {
    return {
      erro: error.code === "same_password" ? "A nova senha precisa ser diferente da atual." : "Não foi possível trocar a senha. Tente novamente.",
      ok: false,
    };
  }
  return { erro: null, ok: true };
}
