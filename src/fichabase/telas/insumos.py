"""Tela de insumos."""

from __future__ import annotations

import pandas as pd
import streamlit as st
from sqlalchemy import func, select

from fichabase.auditoria import registrar
from fichabase.auth import empresa_atual, usuario_logado
from fichabase.db import get_session
from fichabase.importacao import gerar_planilha_modelo, importar_insumos, localizar_colunas
from fichabase.models import CATEGORIA_INSUMO, Categoria, Insumo
from fichabase.ui import badge

SEM_CATEGORIA = "Sem categoria"
TODAS_CATEGORIAS = "Todas as categorias"
UNIDADES = ["kg", "g", "l", "ml", "un", "pc"]
TAMANHO_PAGINA = 25


def pagina_insumos() -> None:
    """Cadastro de insumos da empresa."""
    with get_session() as session:
        usuario = usuario_logado(session)
        if usuario is None:
            st.stop()

        empresa = empresa_atual(session, usuario)
        if empresa is None:
            st.info("Nenhuma empresa vinculada a este usuário ainda. Fale com o admin.")
            st.stop()


        st.title(f"Insumos — {empresa.nome}")

        categorias = session.scalars(
            select(Categoria)
            .where(Categoria.empresa_id == empresa.id, Categoria.tipo == CATEGORIA_INSUMO)
            .order_by(Categoria.nome)
        ).all()
        nomes_categorias = [c.nome for c in categorias]

        if usuario.pode_gerenciar_conteudo:
            with st.expander("Novo insumo", icon=":material/add:"), st.form("novo_insumo", clear_on_submit=True):
                nome = st.text_input("Nome")
                unidade = st.selectbox("Unidade de medida", UNIDADES)
                nome_categoria = st.selectbox("Categoria", [SEM_CATEGORIA] + nomes_categorias)
                if not categorias:
                    st.caption("Nenhuma categoria de insumo cadastrada — crie uma em **Configurações → Categorias** se quiser organizar.")
                if st.form_submit_button("Salvar", type="primary") and nome:
                    ja_existe = session.scalar(
                        select(Insumo).where(
                            Insumo.empresa_id == empresa.id,
                            func.lower(Insumo.nome) == nome.strip().lower(),
                        )
                    )
                    if ja_existe:
                        st.error("Já existe um insumo com esse nome.")
                    else:
                        categoria_escolhida = next((c for c in categorias if c.nome == nome_categoria), None)
                        session.add(
                            Insumo(
                                empresa_id=empresa.id,
                                nome=nome.strip(),
                                unidade_medida=unidade,
                                categoria_id=categoria_escolhida.id if categoria_escolhida else None,
                            )
                        )
                        registrar(session, usuario, empresa, "criar", "Insumo", f"Insumo '{nome}'")
                        session.commit()
                        st.success(f"Insumo '{nome}' cadastrado.")
                        st.rerun()

            with st.expander("Importar planilha", icon=":material/upload_file:"):
                st.caption(
                    "Aceita Excel (.xlsx) ou CSV. Precisa ter uma coluna **Nome**; "
                    "as colunas **Unidade** e **Categoria** são opcionais. Insumos que já "
                    "existem (mesmo nome) são ignorados, nada é sobrescrito."
                )
                st.download_button(
                    "Baixar planilha modelo",
                    icon=":material/download:",
                    data=gerar_planilha_modelo(),
                    file_name="modelo_insumos_fichabase.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    key="baixar_modelo_insumos",
                )
                arquivo = st.file_uploader(
                    "Arquivo", type=["xlsx", "csv"], key="upload_insumos", label_visibility="collapsed"
                )
                if arquivo is not None:
                    try:
                        df = (
                            pd.read_csv(arquivo)
                            if arquivo.name.lower().endswith(".csv")
                            else pd.read_excel(arquivo)
                        )
                    except Exception as erro:  # noqa: BLE001 - formato inválido vira mensagem na tela
                        st.error(f"Não consegui ler o arquivo: {erro}")
                        df = None

                    if df is not None:
                        if localizar_colunas(df)["nome"] is None:
                            st.error(
                                f"A planilha precisa de uma coluna chamada **Nome**. "
                                f"Colunas encontradas: {', '.join(str(c) for c in df.columns)}"
                            )
                        else:
                            st.write(f"**{len(df)} linha(s)** encontrada(s). Prévia:")
                            st.dataframe(df.head(10), hide_index=True)
                            criar_categorias = st.checkbox(
                                "Criar categorias que ainda não existem", value=True, key="import_criar_cat"
                            )
                            if st.button("Importar insumos", type="primary", key="botao_importar"):
                                resultado = importar_insumos(
                                    session, empresa, df, list(categorias), criar_categorias
                                )
                                registrar(
                                    session, usuario, empresa, "criar", "Insumo",
                                    f"Importação de planilha: {resultado.criados} insumo(s) criado(s), "
                                    f"{resultado.ignorados} ignorado(s)",
                                )
                                session.commit()
                                st.success(
                                    f"{resultado.criados} insumo(s) importado(s). "
                                    f"{resultado.ignorados} já existiam e foram ignorados."
                                )
                                if resultado.categorias_criadas:
                                    st.info(
                                        "Categorias criadas: "
                                        + ", ".join(sorted(set(resultado.categorias_criadas)))
                                    )
                                st.rerun()

            with st.expander("Edição em massa (mudar categoria de vários)", icon=":material/sell:"):
                todos_insumos = session.scalars(
                    select(Insumo).where(Insumo.empresa_id == empresa.id).order_by(Insumo.nome)
                ).all()
                if not categorias:
                    st.caption("Cadastre uma categoria de insumo primeiro em **Configurações → Categorias**.")
                elif not todos_insumos:
                    st.caption("Nenhum insumo cadastrado ainda.")
                else:
                    nomes_escolhidos = st.multiselect(
                        "Insumos (pode digitar para buscar)",
                        [i.nome for i in todos_insumos],
                        key="massa_insumos",
                    )
                    categoria_massa = st.selectbox(
                        "Nova categoria para todos os selecionados",
                        [SEM_CATEGORIA] + nomes_categorias,
                        key="massa_categoria",
                    )
                    if st.button(
                        f"Aplicar em {len(nomes_escolhidos)} insumo(s)",
                        type="primary",
                        disabled=not nomes_escolhidos,
                        key="massa_aplicar",
                    ):
                        cat_destino = next((c for c in categorias if c.nome == categoria_massa), None)
                        escolhidos = [i for i in todos_insumos if i.nome in nomes_escolhidos]
                        for insumo in escolhidos:
                            insumo.categoria_id = cat_destino.id if cat_destino else None
                        registrar(
                            session, usuario, empresa, "editar", "Insumo",
                            f"Edição em massa: {len(escolhidos)} insumo(s) movido(s) para '{categoria_massa}'",
                        )
                        session.commit()
                        st.success(f"{len(escolhidos)} insumo(s) movido(s) para '{categoria_massa}'.")
                        st.rerun()

        # ── Lista com busca e filtro ──────────────────────────────────────────
        col_busca, col_filtro = st.columns([2, 1])
        busca = col_busca.text_input(
            "Buscar insumo", placeholder="Buscar por nome...", key="busca_insumo"
        )
        filtro_categoria = col_filtro.selectbox(
            "Categoria", [TODAS_CATEGORIAS, SEM_CATEGORIA] + nomes_categorias, key="filtro_cat_insumo"
        )

        insumos = session.scalars(
            select(Insumo).where(Insumo.empresa_id == empresa.id).order_by(Insumo.nome)
        ).all()
        insumos = [
            i
            for i in insumos
            if (not busca or busca.strip().lower() in i.nome.lower())
            and (
                filtro_categoria == TODAS_CATEGORIAS
                or (filtro_categoria == SEM_CATEGORIA and i.categoria is None)
                or (i.categoria is not None and i.categoria.nome == filtro_categoria)
            )
        ]

        st.caption(f"{len(insumos)} insumo(s) encontrado(s).")

        if not insumos:
            st.info("Nenhum insumo encontrado com esses filtros.")
        else:
            # Paginação: com centenas de insumos, renderizar todos de uma vez deixa
            # a página pesada demais pra abrir em conexão fraca.
            filtro_atual = (busca, filtro_categoria)
            if st.session_state.get("_ultimo_filtro_insumos") != filtro_atual:
                st.session_state["pagina_insumos"] = 1
                st.session_state["_ultimo_filtro_insumos"] = filtro_atual

            total_paginas = max(1, -(-len(insumos) // TAMANHO_PAGINA))
            pagina_atual = min(st.session_state.get("pagina_insumos", 1), total_paginas)
            inicio = (pagina_atual - 1) * TAMANHO_PAGINA

            for i in insumos[inicio : inicio + TAMANHO_PAGINA]:
                with st.container(border=True):
                    tags = badge(i.unidade_medida, "azul")
                    if i.categoria:
                        tags += badge(i.categoria.nome, "rosa")
                    st.markdown(f"**{i.nome}**  \n{tags}", unsafe_allow_html=True)

                    if not usuario.pode_gerenciar_conteudo:
                        continue

                    with st.expander("Editar", icon=":material/edit:"), st.form(f"editar_insumo_{i.id}"):
                        col_nome_ed, col_unid_ed, col_cat_ed = st.columns([2, 1, 2])
                        novo_nome = col_nome_ed.text_input("Nome", value=i.nome, key=f"nome_insumo_{i.id}")
                        nova_unidade = col_unid_ed.selectbox(
                            "Unidade",
                            UNIDADES,
                            index=UNIDADES.index(i.unidade_medida) if i.unidade_medida in UNIDADES else 0,
                            key=f"unid_insumo_{i.id}",
                        )
                        opcoes_cat = [SEM_CATEGORIA] + nomes_categorias
                        atual_cat = i.categoria.nome if i.categoria else SEM_CATEGORIA
                        nova_categoria = col_cat_ed.selectbox(
                            "Categoria",
                            opcoes_cat,
                            index=opcoes_cat.index(atual_cat) if atual_cat in opcoes_cat else 0,
                            key=f"cat_insumo_{i.id}",
                        )
                        if st.form_submit_button("Salvar alterações", key=f"salvar_insumo_{i.id}"):
                            nome_limpo = novo_nome.strip()
                            duplicado = session.scalar(
                                select(Insumo).where(
                                    Insumo.empresa_id == empresa.id,
                                            func.lower(Insumo.nome) == nome_limpo.lower(),
                                    Insumo.id != i.id,
                                )
                            )
                            if not nome_limpo:
                                st.error("O nome não pode ficar vazio.")
                            elif duplicado:
                                st.error("Já existe outro insumo com esse nome.")
                            else:
                                cat_nova = next((c for c in categorias if c.nome == nova_categoria), None)
                                descricao = (
                                    f"Insumo '{i.nome}' -> '{nome_limpo}', unidade "
                                    f"{i.unidade_medida} -> {nova_unidade}, categoria "
                                    f"{atual_cat} -> {nova_categoria}"
                                )
                                i.nome = nome_limpo
                                i.unidade_medida = nova_unidade
                                i.categoria_id = cat_nova.id if cat_nova else None
                                registrar(session, usuario, empresa, "editar", "Insumo", descricao)
                                session.commit()
                                st.success("Insumo atualizado.")
                                st.rerun()

            if total_paginas > 1:
                col_ant, col_info, col_prox = st.columns([1, 2, 1])
                if col_ant.button("Anterior", icon=":material/chevron_left:", disabled=pagina_atual <= 1, use_container_width=True):
                    st.session_state["pagina_insumos"] = pagina_atual - 1
                    st.rerun()
                col_info.markdown(
                    f"<div style='text-align:center;padding-top:0.4rem;'>Página {pagina_atual} de {total_paginas}</div>",
                    unsafe_allow_html=True,
                )
                if col_prox.button("Próxima", icon=":material/chevron_right:", disabled=pagina_atual >= total_paginas, use_container_width=True):
                    st.session_state["pagina_insumos"] = pagina_atual + 1
                    st.rerun()
