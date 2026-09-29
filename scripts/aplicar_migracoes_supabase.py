"""Aplica no Supabase as migrações SQL de supabase/migrations/ que ainda não rodaram.

Uso:
    python scripts/aplicar_migracoes_supabase.py

Precisa de SUPABASE_DB_URL no .env (conexão direta do Postgres, usuário postgres —
Supabase > Connect > Session pooler). Registra cada migração aplicada na mesma tabela
que o Supabase CLI usa (supabase_migrations.schema_migrations), então dá para migrar
para o CLI no futuro sem reaplicar nada. Cada arquivo roda numa transação: se der erro,
nada daquele arquivo fica pela metade.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "supabase" / "migrations"


def main() -> None:
    load_dotenv(RAIZ / ".env")
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        sys.exit("Falta SUPABASE_DB_URL no .env (ver .env.example).")

    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("create schema if not exists supabase_migrations")
        conn.execute(
            "create table if not exists supabase_migrations.schema_migrations "
            "(version text primary key, statements text[], name text)"
        )
        aplicadas = {v for (v,) in conn.execute("select version from supabase_migrations.schema_migrations")}

        pendentes = [a for a in sorted(PASTA.glob("*.sql")) if a.name.split("_", 1)[0] not in aplicadas]
        if not pendentes:
            print("Nenhuma migração pendente.")
            return
        for arquivo in pendentes:
            versao, nome = arquivo.stem.split("_", 1)
            with conn.transaction():
                conn.execute(arquivo.read_text(encoding="utf-8"))
                conn.execute(
                    "insert into supabase_migrations.schema_migrations (version, name) values (%s, %s)",
                    (versao, nome),
                )
            print(f"Aplicada: {arquivo.name}")


if __name__ == "__main__":
    main()
