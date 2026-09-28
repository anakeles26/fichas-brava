from __future__ import annotations

import streamlit as st
from sqlalchemy import func, select

from fichabase.auth import empresa_atual, usuario_logado
from fichabase.db import get_session
from fichabase.models import Insumo, Receita

with get_session() as session:
    usuario = usuario_logado(session)
    if usuario is None:
        st.stop()

    empresa = empresa_atual(session, usuario)
    st.title(f"Dashboard — {empresa.nome}" if empresa else "Dashboard")

    if empresa is None:
        st.info("Nenhuma empresa vinculada a este usuário ainda. Fale com o admin.")
        st.stop()

    n_insumos = session.scalar(
        select(func.count()).select_from(Insumo).where(Insumo.empresa_id == empresa.id)
    )
    n_receitas = session.scalar(
        select(func.count()).select_from(Receita).where(Receita.empresa_id == empresa.id, Receita.ativa)
    )
    with st.container(border=True):
        col1, col2 = st.columns(2)
        col1.metric("Fichas técnicas ativas", n_receitas or 0)
        col2.metric("Insumos cadastrados", n_insumos or 0)

    if not n_receitas:
        st.caption("Comece cadastrando insumos e depois criando sua primeira ficha técnica.")
