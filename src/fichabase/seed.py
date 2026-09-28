"""Carga inicial: cria a empresa, o catálogo de alérgenos e o primeiro
usuário (admin master).

Uso:
    python -m fichabase.seed
"""

from __future__ import annotations

import getpass

from fichabase.auth import hash_senha
from fichabase.db import create_all, get_session
from fichabase.models import Alergeno, Empresa, Usuario

# Empresas criadas na primeira carga. Deixe vazio para digitar o nome na hora.
EMPRESAS: list[str] = []

# Catálogo inicial de alérgenos: (nome, ícone, descrição). Editável depois
# pela página Alérgenos (admin).
ALERGENOS = [
    ("Amêndoas", "🌰", "Presentes em sobremesas, bolos e pães."),
    ("Castanha", "🥥", "Castanha-do-pará, castanha de caju, nozes e outras oleaginosas."),
    ("Corante", "💧", "Corantes artificiais usados em bebidas, doces e alimentos processados."),
    ("Crustáceos", "🦐", "Exemplos: camarão, lagosta, siri e caranguejo."),
    ("Glúten", "🌾", "Presente em pães, bolos, massas, biscoitos e diversos produtos industrializados."),
    ("Lactose", "🥛", "Leite de vaca e derivados."),
    ("Leite", "🐄", "Leite de vaca e derivados."),
    ("Ovo", "🥚", "Ovo de galinha e derivados."),
    ("Peixe", "🐟", "Exemplos: atum, sardinha, salmão e tilápia."),
    ("Soja", "🫘", "Presente em óleo, proteína texturizada, molho shoyu e diversos industrializados."),
]


def slugify(nome: str) -> str:
    return nome.strip().lower().replace(" ", "-")


def seed() -> None:
    create_all()

    with get_session() as session:
        existentes = {e.nome for e in session.query(Empresa).all()}
        nomes = EMPRESAS or ([input("Nome da empresa: ").strip()] if not existentes else [])
        for nome in nomes:
            if nome and nome not in existentes:
                session.add(Empresa(nome=nome, slug=slugify(nome)))

        alergenos_existentes = {a.nome for a in session.query(Alergeno).all()}
        for nome, icone, descricao in ALERGENOS:
            if nome not in alergenos_existentes:
                session.add(Alergeno(nome=nome, icone=icone, descricao=descricao))
        session.flush()

        if session.query(Usuario).filter_by(papel="admin_master").first():
            print("Já existe um admin master, seed de usuário pulado.")
            return

        print("Nenhum admin master encontrado. Vamos criar o primeiro acesso.")
        nome = input("Nome do admin master: ").strip()
        email = input("Email do admin master: ").strip()
        senha = getpass.getpass("Senha do admin master: ")

        session.add(
            Usuario(
                nome=nome,
                email=email,
                senha_hash=hash_senha(senha),
                papel="admin_master",
                empresa_id=None,
            )
        )
        print(f"Admin master '{nome}' <{email}> criado com sucesso.")


if __name__ == "__main__":
    seed()
