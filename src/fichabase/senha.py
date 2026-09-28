"""Validação e geração de senha — usado tanto na criação de usuário (senha
provisória gerada automaticamente) quanto na troca obrigatória no primeiro
login (`app.py`)."""

from __future__ import annotations

import re
import secrets
import string


def senha_valida(senha: str) -> bool:
    return len(senha) >= 6 and bool(re.search(r"[A-Za-z]", senha)) and bool(re.search(r"[0-9\W]", senha))


def gerar_senha_provisoria() -> str:
    """8 caracteres aleatórios, sorteando de novo até garantir letra + número
    (mistura de letras e dígitos tem ~23% de chance de sair só-letras)."""
    alfabeto = string.ascii_letters + string.digits
    while True:
        candidata = "".join(secrets.choice(alfabeto) for _ in range(8))
        if senha_valida(candidata):
            return candidata
