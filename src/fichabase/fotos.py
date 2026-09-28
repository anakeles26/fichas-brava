"""Armazenamento de fotos de fichas técnicas.

Delega pro Supabase Storage (`storage.py`) — salvar em disco local (como era
antes) não funciona em produção: o disco do Streamlit Community Cloud é
apagado a cada reinício/deploy, então a foto sumia pra qualquer usuário
depois do primeiro restart do app.
"""

from __future__ import annotations

import mimetypes

from fichabase.storage import enviar_foto


def salvar_foto(conteudo: bytes, extensao: str = "jpg") -> str:
    ext = extensao.lstrip(".") or "jpg"
    content_type = mimetypes.guess_type(f"x.{ext}")[0] or "image/jpeg"
    return enviar_foto(conteudo, extensao=ext, content_type=content_type)
