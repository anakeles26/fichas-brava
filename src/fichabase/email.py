"""Envio de e-mail transacional via Resend — usado pra mandar a senha
provisória quando um usuário novo é criado (`pages/usuarios.py`).

Sem biblioteca de terceiros de propósito: a API do Resend é um POST JSON
simples, não vale adicionar uma dependência nova (`resend`/`requests`) só
por isso — `urllib.request` (stdlib) já resolve.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from fichabase.config import get_settings


class EmailError(Exception):
    """Erro ao enviar e-mail — capturado no chamador pra não travar a
    criação do usuário (a senha provisória continua exibida na tela como
    alternativa)."""


def enviar_senha_provisoria(nome: str, email: str, senha: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        raise EmailError("RESEND_API_KEY não configurada no .env/secrets.")

    corpo_html = f"""
        <p>Olá, {nome}!</p>
        <p>Sua conta no <strong>FichaBase</strong> (sistema de fichas técnicas) foi criada.
        Use os dados abaixo para o primeiro acesso:</p>
        <p><strong>Email:</strong> {email}<br>
        <strong>Senha provisória:</strong> {senha}</p>
        <p>No primeiro login, o sistema vai pedir pra você criar uma senha nova, só sua.</p>
    """
    payload = json.dumps(
        {
            "from": settings.resend_from,
            "to": [email],
            "subject": "Seu acesso ao FichaBase",
            "html": corpo_html,
        }
    ).encode("utf-8")

    requisicao = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(requisicao, timeout=10) as resposta:
            if resposta.status >= 300:
                raise EmailError(f"Resend retornou status {resposta.status}.")
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")
        raise EmailError(f"Falha ao enviar e-mail ({erro.code}): {detalhe}") from erro
    except urllib.error.URLError as erro:
        raise EmailError(f"Falha ao enviar e-mail: {erro.reason}") from erro
