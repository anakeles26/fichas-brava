from __future__ import annotations

import streamlit as st
from sqlalchemy import select

from fichabase.auth import empresa_atual, usuario_logado
from fichabase.db import get_session
from fichabase.models import LogAuditoria

with get_session() as session:
    usuario = usuario_logado(session)
    if usuario is None:
        st.stop()

    if not usuario.pode_gerenciar_conteudo:
        st.info("Você não tem permissão para acessar Auditoria e Logs — fale com um admin.")
        st.stop()

    empresa = empresa_atual(session, usuario)
    st.title(f"Auditoria e Logs — {empresa.nome if empresa else 'Grupo HosT'}")

    if empresa is None:
        st.info("Nenhuma empresa vinculada a este usuário ainda. Fale com o admin.")
        st.stop()

    logs = session.scalars(
        select(LogAuditoria)
        .where(LogAuditoria.empresa_id == empresa.id)
        .order_by(LogAuditoria.criado_em.desc())
        .limit(200)
    ).all()

    if not logs:
        st.caption("Nenhum registro de auditoria ainda.")
    else:
        for log in logs:
            with st.container(border=True):
                st.write(f"**{log.acao.capitalize()}** {log.entidade} — {log.descricao}")
                st.caption(f"{log.usuario.nome} · {log.criado_em.strftime('%d/%m/%Y %H:%M')}")
