"""Log de acessos: quem entrou no sistema, de qual casa e quando.

Duas visões, no formato do SULTS: por usuário (último acesso, cargo, unidade)
e o histórico de entradas do período. Cada login vira uma linha na tabela
`acessos` (ver app.py) — um registro por sessão, não por página.

O histórico começa na data em que esta tela entrou no ar: acessos anteriores
não foram registrados.
"""

from __future__ import annotations

import datetime as dt
import unicodedata

import pandas as pd
import streamlit as st
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from fichabase.auth import empresa_atual, empresas_visiveis, usuario_logado
from fichabase.datas import FUSO_LOCAL, hoje, para_local
from fichabase.db import get_session
from fichabase.models import PAPEL_LABELS, Acesso, Usuario

SEM_ACESSO = "Nunca acessou"


def _norm(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return sem_acento.lower().strip()


def _local(data: dt.datetime) -> dt.datetime:
    """criado_em é gravado em UTC; a tela mostra no horário local."""
    return para_local(data)


with get_session() as session:
    usuario = usuario_logado(session)
    if usuario is None:
        st.stop()

    if not usuario.pode_gerenciar_conteudo:
        st.info("Você não tem permissão para acessar o Log de acessos — fale com um admin.")
        st.stop()

    empresa = empresa_atual(session, usuario)
    if empresa is None and not usuario.eh_admin_master:
        st.info("Nenhuma empresa vinculada a este usuário ainda. Fale com o admin.")
        st.stop()

    st.title("Log de acessos")

    empresas = empresas_visiveis(session, usuario) if usuario.eh_admin_master else [empresa]
    nomes_empresas = {e.id: e.nome for e in empresas}

    with st.container(border=True):
        col_periodo, col_casas, col_busca = st.columns([1.2, 1.4, 1.4])
        periodo = col_periodo.date_input(
            "Período", value=(hoje() - dt.timedelta(days=30), hoje()), format="DD/MM/YYYY", key="acessos_periodo"
        )
        if usuario.eh_admin_master:
            casas = col_casas.multiselect(
                "Unidades", list(nomes_empresas), default=list(nomes_empresas),
                format_func=nomes_empresas.get, key="acessos_casas",
            )
        else:
            casas = [empresa.id]
            col_casas.text_input("Unidade", value=empresa.nome, disabled=True)
        busca = col_busca.text_input("Pesquisar", placeholder="Nome ou e-mail", key="acessos_busca")

    if not isinstance(periodo, tuple) or len(periodo) != 2:
        st.info("Escolha também a data final do período.")
        st.stop()
    inicio, fim = periodo
    # criado_em é UTC: o dia em Fortaleza termina 3h depois (21h UTC vira o dia seguinte).
    inicio_utc = dt.datetime.combine(inicio, dt.time.min) - FUSO_LOCAL.utcoffset(None)
    fim_utc = dt.datetime.combine(fim, dt.time.max) - FUSO_LOCAL.utcoffset(None)

    # Usuários das unidades escolhidas; o admin master (sem casa) aparece para o próprio admin master.
    filtro_usuarios = Usuario.empresa_id.in_(casas)
    if usuario.eh_admin_master:
        filtro_usuarios = filtro_usuarios | Usuario.empresa_id.is_(None)
    usuarios = session.scalars(
        select(Usuario).where(filtro_usuarios).options(selectinload(Usuario.empresa)).order_by(Usuario.nome)
    ).all()
    if busca:
        usuarios = [u for u in usuarios if _norm(busca) in _norm(f"{u.nome} {u.email}")]
    ids = [u.id for u in usuarios]

    acessos = session.scalars(
        select(Acesso)
        .where(Acesso.usuario_id.in_(ids), Acesso.criado_em.between(inicio_utc, fim_utc))
        .options(selectinload(Acesso.usuario), selectinload(Acesso.empresa))
        .order_by(Acesso.criado_em.desc())
    ).all()
    # Último acesso de todos os tempos (não só do período): é o que a lista mostra.
    ultimo_de: dict[int, dt.datetime] = {}
    total_periodo: dict[int, int] = {}
    for uid, quando in session.execute(
        select(Acesso.usuario_id, Acesso.criado_em).where(Acesso.usuario_id.in_(ids))
    ):
        if uid not in ultimo_de or quando > ultimo_de[uid]:
            ultimo_de[uid] = quando
    for acesso in acessos:
        total_periodo[acesso.usuario_id] = total_periodo.get(acesso.usuario_id, 0) + 1

    aba_usuarios, aba_historico = st.tabs(
        [":material/group: Por usuário", ":material/history: Histórico de entradas"]
    )

    with aba_usuarios:
        if not usuarios:
            st.info("Nenhum usuário encontrado com esses filtros.")
        else:
            tabela = pd.DataFrame([
                {
                    "ID": u.id,
                    "Nome": u.nome,
                    "E-mail": u.email,
                    "Unidade": u.empresa.nome if u.empresa else "Grupo HosT",
                    "Cargo": PAPEL_LABELS.get(u.papel, u.papel),
                    "Último acesso": (
                        _local(ultimo_de[u.id]).strftime("%d/%m/%Y %H:%M") if u.id in ultimo_de else SEM_ACESSO
                    ),
                    "Acessos no período": total_periodo.get(u.id, 0),
                    "Situação": "Ativo" if u.ativo else "Inativo",
                }
                for u in usuarios
            ])
            # Quem entrou mais recentemente primeiro; quem nunca acessou vai para o fim.
            ordem = [pd.Timestamp(ultimo_de[u.id]) if u.id in ultimo_de else pd.NaT for u in usuarios]
            tabela = (
                tabela.assign(_ordem=ordem)
                .sort_values("_ordem", ascending=False, na_position="last")
                .drop(columns="_ordem")
            )
            st.caption(f"{len(tabela)} usuário(s). O **último acesso** considera todo o histórico; "
                       "**acessos no período** conta as entradas entre as datas escolhidas.")
            st.dataframe(tabela, hide_index=True, width="stretch")

    with aba_historico:
        if not acessos:
            st.info(f"Nenhuma entrada registrada entre {inicio:%d/%m/%Y} e {fim:%d/%m/%Y}.")
        else:
            historico = pd.DataFrame([
                {
                    "Data e hora": _local(a.criado_em).strftime("%d/%m/%Y %H:%M"),
                    "Nome": a.usuario.nome,
                    "E-mail": a.usuario.email,
                    "Unidade": a.empresa.nome if a.empresa else "Grupo HosT",
                    "Cargo": PAPEL_LABELS.get(a.usuario.papel, a.usuario.papel),
                }
                for a in acessos
            ])
            st.caption(f"{len(historico)} entrada(s) no período, da mais recente para a mais antiga.")
            st.dataframe(historico, hide_index=True, width="stretch")
