from __future__ import annotations

import streamlit as st
from sqlalchemy import func, select

from fichabase.auditoria import registrar
from fichabase.auth import empresa_atual, usuario_logado
from fichabase.db import get_session
from fichabase.models import (
    CATEGORIA_FICHA,
    CATEGORIA_INSUMO,
    Categoria,
    Insumo,
    Receita,
)

# tipo -> (rótulo da aba, exemplos, modelo que usa a categoria, nome no plural)
ABAS = {
    CATEGORIA_INSUMO: (":material/inventory_2: Insumos", "Ex: Frios, Mercearia, Destilados", Insumo, "insumo(s)"),
    CATEGORIA_FICHA: (
        ":material/menu_book: Fichas técnicas",
        "Ex: Entradas, Pratos, Autorais, Clássicos",
        Receita,
        "ficha(s)",
    ),
}

with get_session() as session:
    usuario = usuario_logado(session)
    if usuario is None:
        st.stop()

    empresa = empresa_atual(session, usuario)
    if empresa is None:
        st.info("Nenhuma empresa vinculada a este usuário ainda. Fale com o admin.")
        st.stop()

    st.title(f"Categorias — {empresa.nome}")
    st.caption(
        "As categorias de insumos organizam o estoque e as de fichas técnicas organizam o "
        "cardápio — uma não aparece na tela da outra."
    )

    abas = st.tabs([ABAS[tipo][0] for tipo in ABAS])

    for aba, tipo in zip(abas, ABAS):
        rotulo, exemplos, modelo, plural = ABAS[tipo]
        chave = tipo
        with aba:
            if usuario.pode_gerenciar_conteudo:
                with st.form(f"nova_categoria_{chave}", clear_on_submit=True):
                    nome = st.text_input("Nova categoria", placeholder=exemplos, key=f"nome_nova_cat_{chave}")
                    if st.form_submit_button("Adicionar", type="primary", key=f"add_cat_{chave}"):
                        nome = nome.strip()
                        ja_existe = nome and session.scalar(
                            select(Categoria).where(
                                Categoria.empresa_id == empresa.id,
                                Categoria.tipo == tipo,
                                func.lower(Categoria.nome) == nome.lower(),
                            )
                        )
                        if not nome:
                            st.error("Digite o nome da categoria.")
                        elif ja_existe:
                            st.error("Já existe uma categoria com esse nome.")
                        else:
                            session.add(Categoria(empresa_id=empresa.id, tipo=tipo, nome=nome))
                            registrar(
                                session, usuario, empresa, "criar", "Categoria",
                                f"Categoria de {tipo} '{nome}'",
                            )
                            session.commit()
                            st.rerun()

            uso = dict(
                session.execute(
                    select(modelo.categoria_id, func.count())
                    .where(modelo.empresa_id == empresa.id, modelo.categoria_id.is_not(None))
                    .group_by(modelo.categoria_id)
                ).all()
            )
            categorias = session.scalars(
                select(Categoria)
                .where(Categoria.empresa_id == empresa.id, Categoria.tipo == tipo)
                .order_by(Categoria.nome)
            ).all()

            if not categorias:
                st.caption("Nenhuma categoria cadastrada ainda.")
            for c in categorias:
                with st.container(border=True):
                    col_nome, col_uso, col_btn = st.columns([4, 2, 1], vertical_alignment="center")
                    col_nome.markdown(f"**{c.nome}**")
                    col_uso.caption(f"{uso.get(c.id, 0)} {plural}")
                    if usuario.pode_gerenciar_conteudo and col_btn.button(
                        "Remover",
                        key=f"rm_cat_{c.id}",
                        help="Os itens dessa categoria ficam sem categoria (nada é apagado)",
                    ):
                        registrar(
                            session, usuario, empresa, "excluir", "Categoria",
                            f"Categoria de {tipo} '{c.nome}'",
                        )
                        session.delete(c)
                        session.commit()
                        st.rerun()
