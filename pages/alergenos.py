from __future__ import annotations

import streamlit as st
from sqlalchemy import select

from fichabase.auditoria import registrar
from fichabase.auth import usuario_logado
from fichabase.db import get_session
from fichabase.models import Alergeno
from fichabase.rls import aplicar_escopo_rls
from fichabase.ui import OPCOES_ICONE_ALERGENO, icone, icone_alergeno

with get_session() as session:
    usuario = usuario_logado(session)
    if usuario is None:
        st.stop()

    # Catálogo global: não depende de empresa, mas a gravação do log passa
    # pela política de RLS de log_auditoria, que lê app.current_empresa_id.
    # Numa conexão reaproveitada do pool essa variável volta como '' (e não
    # nula) e o cast pra número quebrava a exclusão/criação com DataError.
    # Escopo "sem empresa" (0) deixa a política avaliar normalmente.
    aplicar_escopo_rls(session, usuario, None)

    st.title("Alérgenos")
    st.caption(
        "Catálogo compartilhado por todo o Grupo HosT (não é por empresa) — "
        "usado para marcar quais alérgenos cada ficha técnica contém."
    )

    if usuario.eh_admin_master:
        with st.expander("Novo alérgeno", icon=":material/add:"), st.form("novo_alergeno", clear_on_submit=True):
            nome = st.text_input("Nome")
            icone_escolhido = st.pills(
                "Ícone",
                OPCOES_ICONE_ALERGENO,
                format_func=lambda n: f":material/{n}:",
                default=OPCOES_ICONE_ALERGENO[0],
                key="icone_novo_alergeno",
            )
            descricao = st.text_input("Descrição (opcional)")
            if st.form_submit_button("Adicionar", type="primary") and nome:
                ja_existe = session.scalar(select(Alergeno).where(Alergeno.nome == nome))
                if ja_existe:
                    st.error("Esse alérgeno já está cadastrado.")
                else:
                    session.add(Alergeno(nome=nome, icone=icone_escolhido, descricao=descricao or None))
                    registrar(session, usuario, None, "criar", "Alergeno", f"Alérgeno '{nome}'")
                    session.commit()
                    st.success(f"Alérgeno '{nome}' adicionado.")
                    st.rerun()

    alergenos = session.scalars(select(Alergeno).order_by(Alergeno.nome)).all()

    if not alergenos:
        st.caption("Nenhum alérgeno cadastrado ainda.")
    else:
        filtro = st.text_input("Filtrar", placeholder="Filtrar...", label_visibility="collapsed")
        visiveis = [a for a in alergenos if filtro.lower() in a.nome.lower()] if filtro else alergenos

        st.html(
            """
            <style>
            .fh-alergeno-linha { display: flex; align-items: center; gap: 12px;
                padding: 6px 4px; }
            .fh-alergeno-icone { font-size: 1.4rem; width: 2rem; text-align: center; color: #6B7280; }
            .fh-alergeno-nome { font-weight: 600; width: 140px; }
            .fh-alergeno-desc { color: #555; }
            </style>
            """
        )
        for a in visiveis:
            with st.container(border=True):
                col_info, col_btn = st.columns([5, 1])
                col_info.markdown(
                    f'<div class="fh-alergeno-linha">'
                    f'<span class="fh-alergeno-icone">{icone(icone_alergeno(a.nome, a.icone))}</span>'
                    f'<span class="fh-alergeno-nome">{a.nome}</span>'
                    f'<span class="fh-alergeno-desc">{a.descricao or ""}</span>'
                    f"</div>",
                    unsafe_allow_html=True,
                )
                if usuario.eh_admin_master and col_btn.button("Excluir", key=f"rm_alergeno_{a.id}"):
                    registrar(session, usuario, None, "excluir", "Alergeno", f"Alérgeno '{a.nome}'")
                    session.delete(a)
                    session.commit()
                    st.rerun()
