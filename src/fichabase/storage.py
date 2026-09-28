"""Storage de fotos das fichas técnicas via Supabase Storage.

Substitui o disco local (ver `fotos.py`, mantido só para o script de
migração): o disco do Streamlit Community Cloud é apagado a cada
reinício/deploy, então qualquer foto salva ali some. O Supabase Storage é
persistente e as URLs públicas resultantes funcionam local e na nuvem sem
diferença — `pages/fichas_tecnicas.py` já trata `foto_url` como URL quando
começa com "http".

Sem biblioteca de terceiros de propósito (mesmo raciocínio do `email.py`):
a API REST do Storage é HTTP simples, `urllib.request` (stdlib) resolve.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
import uuid

from fichabase.config import get_settings


class StorageError(Exception):
    """Erro ao falar com o Supabase Storage (bucket ausente, upload falhou etc.)."""


def _headers(settings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }


def garantir_bucket() -> None:
    """Cria o bucket se ainda não existir — idempotente, seguro chamar toda
    vez (a API retorna 400 "already exists" se já tiver sido criado)."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise StorageError("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas.")

    payload = json.dumps({"id": settings.supabase_storage_bucket, "name": settings.supabase_storage_bucket, "public": True}).encode(
        "utf-8"
    )
    requisicao = urllib.request.Request(
        f"{settings.supabase_url}/storage/v1/bucket",
        data=payload,
        headers={**_headers(settings), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(requisicao, timeout=10):
            pass
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")
        if "already exists" not in detalhe.lower():
            raise StorageError(f"Falha ao criar bucket ({erro.code}): {detalhe}") from erro
    except urllib.error.URLError as erro:
        raise StorageError(f"Falha ao criar bucket: {erro.reason}") from erro


def enviar_foto(conteudo: bytes, extensao: str = "jpg", content_type: str = "image/jpeg") -> str:
    """Envia os bytes da foto pro bucket e retorna a URL pública final."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise StorageError("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas.")

    nome = f"{uuid.uuid4().hex}.{extensao.lstrip('.') or 'jpg'}"
    requisicao = urllib.request.Request(
        f"{settings.supabase_url}/storage/v1/object/{settings.supabase_storage_bucket}/{nome}",
        data=conteudo,
        headers={**_headers(settings), "Content-Type": content_type},
        method="POST",
    )
    try:
        with urllib.request.urlopen(requisicao, timeout=15):
            pass
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")
        raise StorageError(f"Falha ao enviar foto ({erro.code}): {detalhe}") from erro
    except urllib.error.URLError as erro:
        raise StorageError(f"Falha ao enviar foto: {erro.reason}") from erro

    return f"{settings.supabase_url}/storage/v1/object/public/{settings.supabase_storage_bucket}/{nome}"
