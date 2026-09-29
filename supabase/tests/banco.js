// Banco de teste: Postgres em memória (PGlite) com o mínimo do Supabase que as
// migrações usam — esquema auth, auth.uid() e os papéis anon/authenticated.
// Assim as regras de segurança são testadas de verdade, sem Docker nem nuvem.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const PASTA_MIGRACOES = join(import.meta.dirname, "..", "migrations");

// Igual ao Supabase: auth.uid() lê o "sub" do token da requisição.
const SUPABASE_SIMULADO = `
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant execute on function auth.uid() to anon, authenticated;
    -- O Supabase dá privilégio amplo por padrão em tabelas novas; simulamos isso para
    -- provar que a migração de RLS é que restringe (e não a falta de grant).
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

export async function criarBanco() {
  const db = new PGlite();
  await db.exec(SUPABASE_SIMULADO);
  for (const arquivo of readdirSync(PASTA_MIGRACOES).filter((a) => a.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(PASTA_MIGRACOES, arquivo), "utf8"));
  }
  return db;
}

// Roda `fn` como um usuário do app: papel "authenticated" com o id dado, ou "anon"
// quando id é null. Tudo numa transação desfeita no fim, para um teste não sujar o outro.
export async function como(db, usuarioId, fn) {
  return db.transaction(async (tx) => {
    if (usuarioId) {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [usuarioId]);
      await tx.exec("set local role authenticated");
    } else {
      await tx.exec("set local role anon");
    }
    try {
      return await fn(tx);
    } finally {
      await tx.rollback();
    }
  });
}
