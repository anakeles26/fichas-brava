// Endereço do projeto e chave PÚBLICA do Supabase (publishable/anon). Pode ir para o
// navegador: quem protege os dados são as regras de RLS do banco. A chave secreta
// (service role) nunca entra neste app.
export function configSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver web/.env.example).",
    );
  }
  return { url, chave };
}
