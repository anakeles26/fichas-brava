"""Registro de auditoria: chamado logo antes de cada `session.commit()` que
cria/edita/remove um dado operacional, pra manter o log no mesmo commit da
mudança que ele descreve."""

from __future__ import annotations

from sqlalchemy.orm import Session

from fichabase.models import Empresa, LogAuditoria, Usuario


def registrar(
    session: Session,
    usuario: Usuario,
    empresa: Empresa | None,
    acao: str,
    entidade: str,
    descricao: str,
) -> None:
    session.add(
        LogAuditoria(
            empresa_id=empresa.id if empresa else None,
            usuario_id=usuario.id,
            acao=acao,
            entidade=entidade,
            descricao=descricao,
        )
    )
