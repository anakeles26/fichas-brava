import "server-only";

import { createClient } from "@supabase/supabase-js";
import { configSupabase } from "./config";

/**
 * Cliente com a chave SECRETA (service role), só para criar e alterar logins — coisa que a
 * chave pública não pode fazer. Ignora a RLS, então só use depois de confirmar que quem
 * pediu é gestão ativa (ver lib/usuarios.ts). A variável NÃO tem prefixo NEXT_PUBLIC_:
 * ela fica no servidor e nunca vai para o navegador.
 */
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (ver web/.env.example) para gerenciar usuários.");
  }
  return createClient(configSupabase().url, chave, { auth: { autoRefreshToken: false, persistSession: false } });
}
