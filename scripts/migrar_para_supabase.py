"""Copia as fichas do banco local (SQLite do app Streamlit) para o Supabase e cria os
logins do app novo.

Uso:
    python scripts/migrar_para_supabase.py \
        --usuario "anakelles@gmail.com|Ana Keles|gestao" \
        --usuario "cozinha@exemplo.com|Cozinha Brava|cozinha"

Precisa no .env:
    SUPABASE_DB_URL            conexão direta do Postgres (usuário postgres)
    SUPABASE_URL               https://<projeto>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  chave secreta (só para criar logins; nunca vai para a Vercel)

Pode rodar de novo: apaga e regrava as fichas, insumos e categorias da casa, mantendo
os mesmos IDs (links como /fichas/12 continuam valendo). Serve para o período em que o
cadastro ainda é feito no Streamlit — quando a Entrega 2 (cadastro no app novo) entrar,
o Supabase passa a ser a fonte e este script deixa de ser usado.

Logins novos ganham senha provisória, gravada em ACESSO_SUPABASE.txt (fora do git).
Logins que já existem não são alterados (só o perfil: nome, papel e casa).
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sqlite3
import string
import sys
import urllib.error
import urllib.request
from pathlib import Path

import psycopg
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
SQLITE = RAIZ / "fichas_brava.db"
ARQUIVO_ACESSOS = RAIZ / "ACESSO_SUPABASE.txt"
EMPRESA = ("Brava Wine", "brava-wine")
PAPEIS = ("gestao", "cozinha")

# Tabelas com IDs copiados do SQLite: o contador automático precisa ser acertado depois
# (senão o próximo cadastro tenta reusar um ID já ocupado).
TABELAS_COM_ID_COPIADO = ("categorias", "insumos", "fichas")


def ler_sqlite(empresa_nome: str) -> dict:
    con = sqlite3.connect(SQLITE)
    con.row_factory = sqlite3.Row
    empresa = con.execute("select id from empresas where nome = ?", (empresa_nome,)).fetchone()
    if empresa is None:
        sys.exit(f"Empresa '{empresa_nome}' não encontrada em {SQLITE.name}.")
    eid = empresa["id"]

    def q(sql: str) -> list[dict]:
        return [dict(r) for r in con.execute(sql, (eid,))]

    dados = {
        "categorias": q("select id, tipo, nome from categorias where empresa_id = ?"),
        "insumos": q("select id, nome, unidade_medida as unidade, categoria_id from insumos where empresa_id = ?"),
        "fichas": q(
            """select id, nome, categoria_id, rendimento_quantidade as rendimento_qtd, rendimento_unidade,
                      observacoes, validade_congelado_dias, validade_refrigerado_dias, validade_ambiente_dias,
                      verificada, ativa, criado_em
               from receitas where empresa_id = ?"""
        ),
        # A ordem dos ingredientes no app antigo é a de cadastro (id crescente).
        "itens": q(
            """select ri.receita_id as ficha_id, ri.insumo_id, ri.sub_receita_id as sub_ficha_id,
                      ri.quantidade, ri.unidade_sub_receita as unidade_sub, ri.observacao,
                      row_number() over (partition by ri.receita_id order by ri.id) - 1 as ordem
               from receita_insumos ri join receitas r on r.id = ri.receita_id
               where r.empresa_id = ?"""
        ),
        "passos": q(
            """select p.receita_id as ficha_id, p.ordem, p.descricao, p.tempo_min
               from passos_preparo p join receitas r on r.id = p.receita_id where r.empresa_id = ?"""
        ),
        "ficha_alergenos": q(
            """select ra.receita_id as ficha_id, a.nome as alergeno
               from receita_alergenos ra join alergenos a on a.id = ra.alergeno_id
               join receitas r on r.id = ra.receita_id where r.empresa_id = ?"""
        ),
    }
    dados["alergenos"] = [dict(r) for r in con.execute("select nome, icone, descricao from alergenos")]
    con.close()
    return dados


def gravar_supabase(conn: psycopg.Connection, dados: dict) -> int:
    """Tudo numa transação: se algo falhar, o Supabase fica como estava."""
    with conn.transaction():
        (empresa_id,) = conn.execute(
            """insert into public.empresas (nome, slug) values (%s, %s)
               on conflict (slug) do update set nome = excluded.nome returning id""",
            EMPRESA,
        ).fetchone()

        # Apaga o que é da casa (itens, passos e alérgenos das fichas vão junto, em cascata).
        conn.execute("delete from public.fichas where empresa_id = %s", (empresa_id,))
        conn.execute("delete from public.insumos where empresa_id = %s", (empresa_id,))
        conn.execute("delete from public.categorias where empresa_id = %s", (empresa_id,))

        for a in dados["alergenos"]:
            conn.execute(
                """insert into public.alergenos (nome, icone, descricao) values (%(nome)s, %(icone)s, %(descricao)s)
                   on conflict (nome) do update set icone = excluded.icone, descricao = excluded.descricao""",
                a,
            )
        alergeno_id = dict(conn.execute("select nome, id from public.alergenos").fetchall())

        with conn.cursor() as cur:
            cur.executemany(
                """insert into public.categorias (id, empresa_id, tipo, nome) overriding system value
                   values (%(id)s, %(empresa_id)s, %(tipo)s, %(nome)s)""",
                [{**c, "empresa_id": empresa_id} for c in dados["categorias"]],
            )
            cur.executemany(
                """insert into public.insumos (id, empresa_id, nome, unidade, categoria_id) overriding system value
                   values (%(id)s, %(empresa_id)s, %(nome)s, %(unidade)s, %(categoria_id)s)""",
                [{**i, "empresa_id": empresa_id} for i in dados["insumos"]],
            )
            cur.executemany(
                """insert into public.fichas (id, empresa_id, nome, categoria_id, rendimento_qtd, rendimento_unidade,
                       observacoes, validade_congelado_dias, validade_refrigerado_dias, validade_ambiente_dias,
                       verificada, ativa, criado_em) overriding system value
                   values (%(id)s, %(empresa_id)s, %(nome)s, %(categoria_id)s, %(rendimento_qtd)s, %(rendimento_unidade)s,
                       %(observacoes)s, %(validade_congelado_dias)s, %(validade_refrigerado_dias)s,
                       %(validade_ambiente_dias)s, %(verificada)s, %(ativa)s, %(criado_em)s)""",
                [
                    {**f, "empresa_id": empresa_id, "verificada": bool(f["verificada"]), "ativa": bool(f["ativa"])}
                    for f in dados["fichas"]
                ],
            )
            cur.executemany(
                """insert into public.ficha_itens (ficha_id, ordem, insumo_id, sub_ficha_id, quantidade, unidade_sub, observacao)
                   values (%(ficha_id)s, %(ordem)s, %(insumo_id)s, %(sub_ficha_id)s, %(quantidade)s, %(unidade_sub)s, %(observacao)s)""",
                dados["itens"],
            )
            cur.executemany(
                """insert into public.passos (ficha_id, ordem, descricao, tempo_min)
                   values (%(ficha_id)s, %(ordem)s, %(descricao)s, %(tempo_min)s)""",
                dados["passos"],
            )
            cur.executemany(
                "insert into public.ficha_alergenos (ficha_id, alergeno_id) values (%s, %s)",
                [(fa["ficha_id"], alergeno_id[fa["alergeno"]]) for fa in dados["ficha_alergenos"]],
            )

        for tabela in TABELAS_COM_ID_COPIADO:  # nomes fixos (não vêm de fora): f-string é seguro aqui
            conn.execute(
                f"select setval(pg_get_serial_sequence('public.{tabela}', 'id'), "
                f"greatest((select max(id) from public.{tabela}), 1))"
            )
    return empresa_id


def gerar_senha() -> str:
    alfabeto = string.ascii_letters + string.digits
    while True:
        senha = "Brava-" + "".join(secrets.choice(alfabeto) for _ in range(8))
        if any(c.isdigit() for c in senha):
            return senha


def criar_login(supabase_url: str, service_key: str, email: str, senha: str) -> bool:
    """Cria o login no Supabase Auth (já confirmado). False se o e-mail já tinha login."""
    pedido = urllib.request.Request(
        f"{supabase_url.rstrip('/')}/auth/v1/admin/users",
        data=json.dumps({"email": email, "password": senha, "email_confirm": True}).encode(),
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(pedido, timeout=30):
            return True
    except urllib.error.HTTPError as erro:
        corpo = erro.read().decode(errors="replace")
        if erro.code == 422 and "exist" in corpo.lower():
            return False
        raise RuntimeError(f"Erro ao criar login {email}: HTTP {erro.code} {corpo}") from erro


def criar_usuarios(conn, empresa_id: int, usuarios: list[tuple[str, str, str]]) -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        sys.exit("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env para criar os logins.")

    novos = []
    for email, nome, papel in usuarios:
        senha = gerar_senha()
        if criar_login(supabase_url, service_key, email, senha):
            novos.append((email, senha))
        (uid,) = conn.execute("select id from auth.users where lower(email) = lower(%s)", (email,)).fetchone()
        conn.execute(
            """insert into public.perfis (id, empresa_id, nome, papel) values (%s, %s, %s, %s)
               on conflict (id) do update set empresa_id = excluded.empresa_id, nome = excluded.nome,
                   papel = excluded.papel, ativo = true""",
            (uid, empresa_id, nome, papel),
        )
        print(f"  login {'criado' if (email, senha) in novos else 'já existia'}: {email} ({papel})")

    if novos:
        with ARQUIVO_ACESSOS.open("a", encoding="utf-8") as f:
            for email, senha in novos:
                f.write(f"{email}\tsenha provisória: {senha}\n")
        print(f"  senhas provisórias dos logins novos em {ARQUIVO_ACESSOS.name}")


def conferir(conn, empresa_id: int, dados: dict) -> bool:
    contagens = {
        "categorias": ("select count(*) from public.categorias where empresa_id = %s", len(dados["categorias"])),
        "insumos": ("select count(*) from public.insumos where empresa_id = %s", len(dados["insumos"])),
        "fichas": ("select count(*) from public.fichas where empresa_id = %s", len(dados["fichas"])),
        "ingredientes": (
            "select count(*) from public.ficha_itens i join public.fichas f on f.id = i.ficha_id where f.empresa_id = %s",
            len(dados["itens"]),
        ),
        "passos": (
            "select count(*) from public.passos p join public.fichas f on f.id = p.ficha_id where f.empresa_id = %s",
            len(dados["passos"]),
        ),
        "alérgenos das fichas": (
            "select count(*) from public.ficha_alergenos a join public.fichas f on f.id = a.ficha_id where f.empresa_id = %s",
            len(dados["ficha_alergenos"]),
        ),
    }
    tudo_ok = True
    print("\nConferência (local → Supabase):")
    for nome, (sql, esperado) in contagens.items():
        (obtido,) = conn.execute(sql, (empresa_id,)).fetchone()
        ok = obtido == esperado
        tudo_ok &= ok
        print(f"  {'ok ' if ok else 'ERRO'} {nome}: {esperado} → {obtido}")
    return tudo_ok


MIGRACAO_CADASTRO = "20260930000001"  # Entrega 2: o cadastro passou a ser feito no app novo


def recusar_se_cadastro_no_app(conn: psycopg.Connection) -> None:
    """Trava da virada: com a Entrega 2 aplicada, o Supabase é a fonte oficial. Este script
    apaga e regrava fichas, insumos e categorias — rodá-lo agora destruiria o que foi
    cadastrado no app novo e, em cascata, os apelidos aprendidos na importação."""
    aplicada = conn.execute(
        "select exists (select 1 from supabase_migrations.schema_migrations where version = %s)",
        (MIGRACAO_CADASTRO,),
    ).fetchone()[0]
    if aplicada:
        sys.exit(
            "Migração recusada: o cadastro agora é feito no app novo (Supabase é a fonte oficial).\n"
            "Rodar este script apagaria fichas, insumos, categorias e apelidos cadastrados lá."
        )


def ler_usuario(texto: str) -> tuple[str, str, str]:
    partes = [p.strip() for p in texto.split("|")]
    if len(partes) != 3 or partes[2] not in PAPEIS or "@" not in partes[0]:
        raise argparse.ArgumentTypeError('use "email|Nome|gestao" ou "email|Nome|cozinha"')
    return partes[0], partes[1], partes[2]


def main() -> None:
    parser = argparse.ArgumentParser(description="Copia as fichas do SQLite para o Supabase.")
    parser.add_argument("--usuario", type=ler_usuario, action="append", default=[], help='"email|Nome|papel"')
    args = parser.parse_args()

    load_dotenv(RAIZ / ".env")
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("Falta SUPABASE_DB_URL no .env.")

    dados = ler_sqlite(EMPRESA[0])
    print(f"Local: {len(dados['fichas'])} fichas, {len(dados['insumos'])} insumos.")
    with psycopg.connect(db_url) as conn:
        recusar_se_cadastro_no_app(conn)
        empresa_id = gravar_supabase(conn, dados)
        if args.usuario:
            with conn.transaction():
                criar_usuarios(conn, empresa_id, args.usuario)
        ok = conferir(conn, empresa_id, dados)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
