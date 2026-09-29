import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configSupabase } from "./config";

/**
 * Cliente do Supabase para Server Components e Server Actions, com a sessão da pessoa
 * (lida dos cookies). Toda consulta passa pela RLS com o login dela.
 */
export async function criarClienteServidor() {
  const { url, chave } = configSupabase();
  const cookieStore = await cookies();
  return createServerClient(url, chave, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) cookieStore.set(name, value, options);
        } catch {
          // Server Component não pode gravar cookie; o proxy.ts renova a sessão a cada
          // requisição, então pode ignorar aqui.
        }
      },
    },
  });
}
