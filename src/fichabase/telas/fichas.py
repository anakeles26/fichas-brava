"""Tela de fichas técnicas: lista, criação e detalhe."""

from __future__ import annotations

import base64
import datetime as dt
import mimetypes
from pathlib import Path

import streamlit as st
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from fichabase.auditoria import registrar
from fichabase.auth import empresa_atual, usuario_logado
from fichabase.db import get_session
from fichabase.fotos import salvar_foto
from fichabase.impressao import html_impressao, linhas_itens
from fichabase.models import (
    CATEGORIA_FICHA,
    Alergeno,
    Categoria,
    Insumo,
    PassoPreparo,
    Receita,
    ReceitaInsumo,
)
from fichabase.receitas import (
    UNIDADES,
    UNIDADES_COMPATIVEIS,
    ItemComposicao,
    converter_unidade,
    formatar_quantidade,
    materializar_itens,
    unidade_de_exibicao,
)
from fichabase.ui import badge, data_por_extenso, icone, icone_alergeno, stat_box

# Sentinelas do estado "ficha_selecionada" — não são mais rótulo de nenhum
# widget (a busca por nome virou grade de cards), então dá pra atribuir
# direto sem o truque de session_state adiado usado antes pra sub-receitas.
NOVA = "__nova_ficha__"
LISTA = "__lista_fichas__"

FOTO_CAMERA = ":material/photo_camera: Tirar foto"
FOTO_ARQUIVO = ":material/upload: Enviar arquivo"
FOTO_LINK = ":material/link: Link (URL)"
SEM_CATEGORIA = "Sem categoria"
TODAS_CATEGORIAS = "Todas as categorias"
TODOS_ALERGENOS = "Todos os alérgenos"
SEM_DIFICULDADE = "Não definida"
TODAS_DIFICULDADES = "Todas"
DIFICULDADES = ["Fácil", "Médio", "Difícil"]

# (atributo da Receita, rótulo, ícone) — validade em dias por armazenamento.
VALIDADES = [
    ("validade_congelado_dias", "Congelado", "ac_unit"),
    ("validade_refrigerado_dias", "Refrigerado", "kitchen"),
    ("validade_ambiente_dias", "Temperatura ambiente", "thermostat"),
]
SITUACAO_ATIVAS = "Ativas"
SITUACAO_INATIVAS = "Inativas"
SITUACAO_TODAS = "Ativas e inativas"


# Ícone próprio (utensílios de cozinha em silhueta) pro placeholder de fichas
# sem foto — desenhado do zero com formas básicas de SVG, não é cópia de
# nenhum design de terceiros.
_ICONE_UTENSILIOS = """
<svg viewBox="0 0 220 100" width="42%" style="max-width:120px;opacity:0.35;">
  <rect x="21" y="8" width="6" height="52" rx="3" fill="#6B7280"/>
  <ellipse cx="24" cy="78" rx="15" ry="20" fill="#6B7280"/>
  <rect x="107" y="8" width="6" height="32" rx="3" fill="#6B7280"/>
  <path d="M 96 40 C 90 65, 90 85, 110 95 C 130 85, 130 65, 124 40 Z"
        fill="none" stroke="#6B7280" stroke-width="4"/>
  <path d="M 103 40 C 99 62, 100 80, 110 90" fill="none" stroke="#6B7280" stroke-width="3"/>
  <path d="M 117 40 C 121 62, 120 80, 110 90" fill="none" stroke="#6B7280" stroke-width="3"/>
  <rect x="190" y="8" width="6" height="38" rx="3" fill="#6B7280"/>
  <rect x="172" y="46" width="42" height="36" rx="9" fill="#6B7280"/>
  <rect x="180" y="54" width="8" height="20" rx="3" fill="#F1F3F6"/>
  <rect x="193" y="54" width="8" height="20" rx="3" fill="#F1F3F6"/>
</svg>
"""


def _placeholder_foto(altura: int) -> str:
    return (
        f'<div style="height:{altura}px;border-radius:10px;background:#F1F3F6;'
        f'display:flex;align-items:center;justify-content:center;margin-bottom:0.5rem;">{_ICONE_UTENSILIOS}</div>'
    )


@st.cache_data(show_spinner=False)
def _foto_data_uri(caminho: str) -> str | None:
    """Lê a foto do disco e embute como data URI — necessário pra usar <img
    src> com object-fit:cover (recorte uniforme do card); st.image não tem
    esse controle de recorte e deixaria os cards com alturas diferentes."""
    try:
        dados = Path(caminho).read_bytes()
    except OSError:
        return None
    tipo = mimetypes.guess_type(caminho)[0] or "image/jpeg"
    return f"data:{tipo};base64,{base64.b64encode(dados).decode()}"


def _foto_html(foto_url: str | None, altura: int) -> str:
    if not foto_url:
        return _placeholder_foto(altura)
    src = foto_url if foto_url.startswith(("http://", "https://")) else _foto_data_uri(foto_url)
    if not src:
        return _placeholder_foto(altura)
    return (
        f'<div style="height:{altura}px;border-radius:10px;overflow:hidden;margin-bottom:0.5rem;">'
        f'<img src="{src}" style="width:100%;height:100%;object-fit:cover;display:block;"></div>'
    )


def _foto_src(foto_url: str | None) -> str | None:
    if not foto_url:
        return None
    return foto_url if foto_url.startswith(("http://", "https://")) else _foto_data_uri(foto_url)


def _foto_detalhe_html(src: str) -> str:
    """Foto inteira, na proporção original (object-fit:contain). No detalhe o
    recorte uniforme dos cards não faz sentido: com largura total e altura
    fixa, a foto quadrada virava uma faixa cortada em cima e embaixo."""
    return (
        '<div style="position:relative;border-radius:10px;overflow:hidden;background:#F1F3F6;">'
        f'<img src="{src}" style="width:100%;height:auto;max-height:480px;object-fit:contain;display:block;margin:0 auto;">'
        '<span style="position:absolute;top:10px;right:10px;background:rgba(61,10,22,0.75);color:#fff;'
        f'border-radius:999px;padding:6px;display:flex;">{icone("zoom_in")}</span></div>'
    )


# Botão transparente por cima da foto: o clique em qualquer ponto da imagem
# abre o diálogo (Streamlit não tem clique em imagem; o botão faz esse papel).
_CSS_FOTO_AMPLIAVEL = """
<style>
.st-key-foto_ficha { position: relative; }
.st-key-foto_ficha .st-key-ampliar_foto { position: absolute; inset: 0 0 -1rem 0; z-index: 2; width: 100% !important; }
/* No diálogo a foto cabe inteira na tela; para ver maior, o botão de tela cheia do próprio st.image. */
[role="dialog"] [data-testid="stFullScreenFrame"] { display: flex; justify-content: center; }
[role="dialog"] .stImage img { max-height: 75vh; width: auto !important; max-width: 100%; }
.st-key-ampliar_foto div, .st-key-ampliar_foto span, .st-key-ampliar_foto button {
    width: 100% !important; height: 100% !important;
}
.st-key-ampliar_foto button {
    background: transparent !important; border: none !important; box-shadow: none !important;
    color: transparent !important; cursor: zoom-in;
}
</style>
"""


@st.dialog("Foto da ficha", width="large")
def _ver_foto(nome: str, src: str) -> None:
    st.markdown(f"**{nome}**")
    st.image(src, width="stretch")


def _foto_detalhe(receita: Receita) -> None:
    src = _foto_src(receita.foto_url)
    if not src:
        st.markdown(_placeholder_foto(320), unsafe_allow_html=True)
        return
    st.html(_CSS_FOTO_AMPLIAVEL)
    with st.container(key="foto_ficha"):
        st.markdown(_foto_detalhe_html(src), unsafe_allow_html=True)
        if st.button("Ampliar foto", key="ampliar_foto", help="Clique para ampliar"):
            _ver_foto(receita.nome, src)


def _foto_card_com_selo(foto_url: str | None, categoria_nome: str | None) -> str:
    foto_html = _foto_html(foto_url, 170)
    if not categoria_nome:
        return foto_html
    selo = f'<div style="position:absolute;top:10px;left:10px;">{badge(categoria_nome, "azul")}</div>'
    return f'<div style="position:relative;">{foto_html}{selo}</div>'


def _campos_validade(prefixo_key: str, receita: Receita | None = None) -> dict[str, int | None]:
    """Três campos de validade em dias, lado a lado. Vazio ou 0 = sem
    validade para aquele armazenamento (a ficha pode ter as três, algumas ou
    nenhuma). O 0 conta como "sem validade" para que dê pra tirar uma
    validade tanto apagando o campo quanto digitando 0."""
    st.markdown("**Validade (dias)**")
    st.caption("Deixe vazio (ou 0) o que não se aplica.")
    colunas = st.columns(3)
    valores = {}
    for col, (atributo, rotulo, _) in zip(colunas, VALIDADES):
        valor = col.number_input(
            rotulo,
            min_value=0,
            step=1,
            value=getattr(receita, atributo) if receita else None,
            placeholder="—",
            key=f"{prefixo_key}_{atributo}",
        )
        valores[atributo] = valor or None
    return valores


def _editar_foto(session, usuario, empresa, receita: Receita) -> None:
    """Trocar ou remover a foto da ficha (modo edição). O seletor de origem
    fica fora de st.form de propósito: dentro de um form a troca entre
    câmera/arquivo/link só apareceria depois de enviar."""
    titulo = "Trocar ou remover foto" if receita.foto_url else "Adicionar foto"
    with st.expander(titulo, icon=":material/photo_camera:"):
        metodo = st.radio(
            "Origem da foto",
            [FOTO_ARQUIVO, FOTO_CAMERA, FOTO_LINK],
            horizontal=True,
            label_visibility="collapsed",
            key="foto_edit_metodo",
        )
        camera = arquivo = None
        link = ""
        if metodo == FOTO_CAMERA:
            camera = st.camera_input("Tirar foto", label_visibility="collapsed", key="foto_edit_camera")
        elif metodo == FOTO_ARQUIVO:
            arquivo = st.file_uploader(
                "Enviar imagem", type=["png", "jpg", "jpeg", "webp"], label_visibility="collapsed",
                key="foto_edit_arquivo",
            )
        else:
            link = st.text_input("Link da foto", placeholder="https://...", key="foto_edit_link")

        col_salvar, col_remover = st.columns(2)
        if col_salvar.button("Salvar foto", icon=":material/save:", type="primary", key="salvar_foto_edit",
                             use_container_width=True):
            if camera is not None:
                nova_url = salvar_foto(camera.getvalue(), "jpg")
            elif arquivo is not None:
                nova_url = salvar_foto(arquivo.getvalue(), Path(arquivo.name).suffix or ".jpg")
            elif link.strip():
                nova_url = link.strip()
            else:
                nova_url = None
            if not nova_url:
                st.error("Escolha uma imagem, tire uma foto ou cole um link antes de salvar.")
            else:
                receita.foto_url = nova_url
                registrar(session, usuario, empresa, "editar", "Receita", f"Trocou a foto da ficha '{receita.nome}'")
                session.commit()
                for chave in ("foto_edit_camera", "foto_edit_arquivo", "foto_edit_link"):
                    st.session_state.pop(chave, None)
                st.rerun()

        if receita.foto_url and col_remover.button(
            "Remover foto", icon=":material/delete:", key="remover_foto_edit", use_container_width=True
        ):
            receita.foto_url = None
            registrar(session, usuario, empresa, "editar", "Receita", f"Removeu a foto da ficha '{receita.nome}'")
            session.commit()
            st.rerun()


def _texto_dias(dias: int) -> str:
    return "1 dia" if dias == 1 else f"{dias} dias"


def _editar_dados_ficha(session, usuario, empresa, receita: Receita, categorias: list[Categoria]) -> None:
    """Pop-up pra corrigir nome, categoria e rendimento da ficha."""
    with st.popover("Editar nome e dados", icon=":material/edit:", key="pop_editar_ficha"):
        with st.form("editar_dados_ficha", border=False):
            novo_nome = st.text_input("Nome da ficha", value=receita.nome, key="nome_ficha_edit")
            opcoes_cat = [SEM_CATEGORIA] + [c.nome for c in categorias]
            atual_cat = receita.categoria.nome if receita.categoria else SEM_CATEGORIA
            nova_cat = st.selectbox(
                "Categoria", opcoes_cat,
                index=opcoes_cat.index(atual_cat) if atual_cat in opcoes_cat else 0,
                key="cat_ficha_edit",
            )
            col_rend, col_unid = st.columns([2, 1])
            novo_rend = col_rend.number_input(
                "Rendimento", min_value=0.01, value=float(receita.rendimento_quantidade or 1), step=1.0,
                format="%g", key="rend_ficha_edit",
            )
            opcoes_unid = ["un", "pc", "kg", "g", "l", "ml"]
            nova_unid = col_unid.selectbox(
                "Unidade", opcoes_unid,
                index=opcoes_unid.index(receita.rendimento_unidade) if receita.rendimento_unidade in opcoes_unid else 0,
                key="unid_ficha_edit",
            )
            if st.form_submit_button("Salvar", type="primary", key="salvar_dados_ficha"):
                nome_limpo = novo_nome.strip()
                duplicada = session.scalar(
                    select(Receita).where(
                        Receita.empresa_id == empresa.id,
                        func.lower(Receita.nome) == nome_limpo.lower(),
                        Receita.id != receita.id,
                    )
                )
                if not nome_limpo:
                    st.error("O nome não pode ficar vazio.")
                elif duplicada:
                    st.error("Já existe outra ficha com esse nome.")
                else:
                    mudancas = []
                    if nome_limpo != receita.nome:
                        mudancas.append(f"nome '{receita.nome}' -> '{nome_limpo}'")
                    if nova_cat != atual_cat:
                        mudancas.append(f"categoria {atual_cat} -> {nova_cat}")
                    receita.nome = nome_limpo
                    categoria = next((c for c in categorias if c.nome == nova_cat), None)
                    receita.categoria_id = categoria.id if categoria else None
                    receita.rendimento_quantidade = novo_rend
                    receita.rendimento_unidade = nova_unid
                    registrar(
                        session, usuario, empresa, "editar", "Receita",
                        f"Editou dados da ficha '{nome_limpo}': " + ("; ".join(mudancas) or "rendimento"),
                    )
                    session.commit()
                    # A ficha aberta é localizada pelo nome — sem isso, renomear
                    # "fecharia" a ficha e voltaria pra lista.
                    st.session_state["ficha_selecionada"] = nome_limpo
                    st.rerun()


def _editar_alergenos(session, usuario, empresa, receita: Receita, catalogo: list[Alergeno]) -> None:
    """Marca/desmarca os alérgenos da ficha (modo edição). Fica à vista, e não
    num pop-up, pelo mesmo motivo da validade: escondido passava despercebido."""
    if not catalogo:
        st.caption("Nenhum alérgeno cadastrado — cadastre em Configurações → Alérgenos.")
        return
    por_nome = {a.nome: a for a in catalogo}
    with st.form("editar_alergenos"):
        escolhidos = st.pills(
            "Alérgenos da ficha",
            list(por_nome),
            selection_mode="multi",
            format_func=lambda nome: f":material/{icone_alergeno(nome, por_nome[nome].icone)}: {nome}",
            default=[a.nome for a in receita.alergenos],
            key="alergenos_edit",
        )
        if st.form_submit_button("Salvar alérgenos", icon=":material/save:"):
            antes = {a.nome for a in receita.alergenos}
            depois = set(escolhidos or [])
            if antes == depois:
                st.info("Nenhuma mudança nos alérgenos.")
                return
            receita.alergenos = [por_nome[nome] for nome in escolhidos or []]
            mudancas = []
            if depois - antes:
                mudancas.append(f"incluiu {', '.join(sorted(depois - antes))}")
            if antes - depois:
                mudancas.append(f"retirou {', '.join(sorted(antes - depois))}")
            registrar(
                session, usuario, empresa, "editar", "Receita",
                f"Alérgenos da ficha '{receita.nome}': {'; '.join(mudancas)}",
            )
            session.commit()
            st.rerun()


def _editar_passo(session, usuario, empresa, receita: Receita, passo: PassoPreparo, numero: int) -> None:
    with st.popover("", icon=":material/edit:", help="Editar passo", key=f"pop_editar_passo_{passo.id}"):
        with st.form(f"editar_passo_{passo.id}", border=False):
            st.markdown(f"**Passo {numero}**")
            nova_desc = st.text_area("Descrição", value=passo.descricao, height=150, key=f"desc_passo_{passo.id}")
            novo_tempo = st.number_input(
                "Tempo estimado (min)", min_value=0, step=1, value=passo.tempo_min or 0, key=f"tempo_passo_{passo.id}"
            )
            if st.form_submit_button("Salvar", type="primary", key=f"salvar_passo_{passo.id}"):
                if not nova_desc.strip():
                    st.error("A descrição não pode ficar vazia.")
                else:
                    passo.descricao = nova_desc.strip()
                    passo.tempo_min = novo_tempo or None
                    registrar(
                        session, usuario, empresa, "editar", "Receita",
                        f"Editou o passo {numero} da ficha '{receita.nome}'",
                    )
                    session.commit()
                    st.rerun()


def _editar_item(session, usuario, empresa, receita: Receita, item: ReceitaInsumo) -> None:
    """Pop-up de edição de um ingrediente já na ficha: quantidade, unidade e
    observação. A quantidade é digitada na unidade que a pessoa escolher (g,
    kg, ml, l...) e convertida pra unidade de cadastro do insumo ao salvar."""
    with st.popover("", icon=":material/edit:", help="Editar quantidade", key=f"pop_editar_{item.id}"):
        with st.form(f"editar_item_{item.id}", border=False):
            st.markdown(f"**{item.nome_item}**")
            valor_exib, unidade_exib = unidade_de_exibicao(float(item.quantidade), item.unidade)
            opcoes = UNIDADES if item.sub_receita_id else UNIDADES_COMPATIVEIS.get(item.unidade, [item.unidade])
            if unidade_exib not in opcoes:
                opcoes = [unidade_exib, *opcoes]
            col_qtd, col_unid = st.columns([2, 1])
            nova_qtd = col_qtd.number_input(
                "Quantidade", min_value=0.0, value=round(valor_exib, 4), step=1.0, format="%g",
                key=f"qtd_item_{item.id}", help="0 = a gosto",
            )
            nova_unidade = col_unid.selectbox(
                "Unidade", opcoes, index=opcoes.index(unidade_exib), key=f"unid_item_{item.id}"
            )
            nova_obs = st.text_input("Observação", value=item.observacao or "", key=f"obs_item_{item.id}")
            if st.form_submit_button("Salvar", type="primary", key=f"salvar_item_{item.id}"):
                antes = formatar_quantidade(float(item.quantidade), item.unidade)
                if item.sub_receita_id:
                    item.quantidade = nova_qtd
                    item.unidade_sub_receita = nova_unidade
                else:
                    item.quantidade = converter_unidade(nova_qtd, nova_unidade, item.insumo.unidade_medida)
                item.observacao = nova_obs.strip() or None
                registrar(
                    session, usuario, empresa, "editar", "Receita",
                    f"Ficha '{receita.nome}': '{item.nome_item}' {antes} -> "
                    f"{formatar_quantidade(nova_qtd, nova_unidade)}",
                )
                session.commit()
                st.rerun()


def _renderizar_itens(itens: list[ItemComposicao], multiplicador: float) -> None:
    for nivel, nome, qtd, aviso in linhas_itens(itens, multiplicador):
        prefixo = ("&nbsp;" * (nivel * 4)) + ("↳ " if nivel > 0 else "")
        st.markdown(f"{prefixo}{nome} — **{qtd}**", unsafe_allow_html=True)
        if aviso:
            st.caption(("&nbsp;" * (nivel * 4)) + f":material/warning: {aviso}")


def pagina_fichas() -> None:
    """Tela de fichas técnicas (a página em pages/ só chama esta função)."""
    with get_session() as session:
        usuario = usuario_logado(session)
        if usuario is None:
            st.stop()

        empresa = empresa_atual(session, usuario)
        if empresa is None:
            st.info("Nenhuma empresa vinculada a este usuário ainda. Fale com o admin.")
            st.stop()


        st.session_state.setdefault("ficha_selecionada", LISTA)
        escolha = st.session_state["ficha_selecionada"]

        todas_receitas = session.scalars(
            select(Receita)
            .where(Receita.empresa_id == empresa.id)
            .options(
                selectinload(Receita.categoria),
                selectinload(Receita.alergenos),
                selectinload(Receita.passos),
            )
            .order_by(Receita.nome)
        ).all()
        categorias = session.scalars(
            select(Categoria)
            .where(Categoria.empresa_id == empresa.id, Categoria.tipo == CATEGORIA_FICHA)
            .order_by(Categoria.nome)
        ).all()
        catalogo_alergenos = session.scalars(select(Alergeno).order_by(Alergeno.nome)).all()

        # ── Lista (grade de cards) ────────────────────────────────────────
        if escolha == LISTA:
            # Lê o valor atual dos filtros ANTES de instanciar os widgets, só pra
            # poder mostrar "N receita(s) encontrada(s)" acima da barra de busca
            # (igual ao layout de referência) — os widgets logo abaixo vão ler
            # a mesma chave do session_state, então não há conflito.
            busca_atual = st.session_state.get("busca_ficha", "")
            cat_atual = st.session_state.get("filtro_categoria_ficha", TODAS_CATEGORIAS)
            alerg_atual = st.session_state.get("filtro_alergeno_ficha", TODOS_ALERGENOS)
            dif_atual = st.session_state.get("filtro_dificuldade_ficha", TODAS_DIFICULDADES)
            situacao_atual = st.session_state.get("filtro_situacao_ficha", SITUACAO_ATIVAS)

            receitas = [
                r
                for r in todas_receitas
                if (not busca_atual or busca_atual.lower() in r.nome.lower())
                and (cat_atual == TODAS_CATEGORIAS or (r.categoria and r.categoria.nome == cat_atual))
                and (alerg_atual == TODOS_ALERGENOS or any(a.nome == alerg_atual for a in r.alergenos))
                and (dif_atual == TODAS_DIFICULDADES or r.dificuldade == dif_atual)
                and (
                    situacao_atual == SITUACAO_TODAS
                    or (situacao_atual == SITUACAO_ATIVAS and r.ativa)
                    or (situacao_atual == SITUACAO_INATIVAS and not r.ativa)
                )
            ]

            col_titulo, col_novo = st.columns([3.2, 2.4])
            col_titulo.markdown(
                f'<div style="font-size:2rem;font-weight:800;">Fichas Técnicas — {empresa.nome}</div>'
                f'<div style="color:#6B7280;">{len(receitas)} receita(s) encontrada(s)</div>',
                unsafe_allow_html=True,
            )
            if usuario.pode_gerenciar_conteudo:
                col_novo.markdown("<div style='height:1.6rem'></div>", unsafe_allow_html=True)
                if col_novo.button("Nova ficha técnica", icon=":material/add:", type="primary", use_container_width=True):
                    st.session_state["ficha_selecionada"] = NOVA
                    st.rerun()

            col_busca, col_cat, col_alerg, col_dif, col_sit = st.columns([2.4, 1.4, 1.5, 1.1, 1.3])
            busca = col_busca.text_input(
                "Buscar por nome", placeholder="Buscar por nome...", label_visibility="collapsed", key="busca_ficha"
            )
            filtro_categoria = col_cat.selectbox(
                "Categoria",
                [TODAS_CATEGORIAS] + [c.nome for c in categorias],
                label_visibility="collapsed",
                key="filtro_categoria_ficha",
            )
            filtro_alergeno = col_alerg.selectbox(
                "Alérgenos",
                [TODOS_ALERGENOS] + [a.nome for a in catalogo_alergenos],
                label_visibility="collapsed",
                key="filtro_alergeno_ficha",
            )
            filtro_dificuldade = col_dif.selectbox(
                "Dificuldade",
                [TODAS_DIFICULDADES] + DIFICULDADES,
                label_visibility="collapsed",
                key="filtro_dificuldade_ficha",
            )
            col_sit.selectbox(
                "Situação",
                [SITUACAO_ATIVAS, SITUACAO_INATIVAS, SITUACAO_TODAS],
                label_visibility="collapsed",
                key="filtro_situacao_ficha",
            )

            if not receitas:
                st.info("Nenhuma ficha técnica encontrada com esses filtros.")
            else:
                # Carrega em páginas de 12 em vez de tudo de uma vez: com muitas
                # fichas (várias com foto), renderizar tudo junto deixa a tela
                # pesada e lenta pra abrir em conexões mais fracas (celular,
                # wi-fi ruim) — visto na prática com usuárias reportando a
                # página de Fichas Técnicas ficando em branco.
                TAMANHO_PAGINA = 12
                filtro_atual = (busca_atual, cat_atual, alerg_atual, dif_atual, situacao_atual)
                if st.session_state.get("_ultimo_filtro_fichas") != filtro_atual:
                    st.session_state["pagina_fichas"] = 1
                    st.session_state["_ultimo_filtro_fichas"] = filtro_atual

                total_paginas = max(1, -(-len(receitas) // TAMANHO_PAGINA))
                pagina_atual = min(st.session_state.get("pagina_fichas", 1), total_paginas)
                inicio = (pagina_atual - 1) * TAMANHO_PAGINA
                receitas_pagina = receitas[inicio : inicio + TAMANHO_PAGINA]

                cols = st.columns(3)
                for idx, r in enumerate(receitas_pagina):
                    with cols[idx % 3], st.container(border=True):
                        st.markdown(
                            _foto_card_com_selo(r.foto_url, r.categoria.nome if r.categoria else None),
                            unsafe_allow_html=True,
                        )
                        st.markdown(f"**{r.nome}**")
                        selos = "" if r.ativa else badge("Inativa", "rosa", "block")
                        selos += badge(r.dificuldade, "amarelo") if r.dificuldade else ""
                        selos += (
                            badge("Verificada", "verde", "verified")
                            if r.verificada
                            else badge("Não verificada", "amarelo", "error")
                        )
                        st.markdown(selos, unsafe_allow_html=True)
                        tempo_total = sum(p.tempo_min or 0 for p in r.passos)
                        tempo_txt = f"{tempo_total}min" if tempo_total else "—"
                        rend_txt = formatar_quantidade(float(r.rendimento_quantidade), r.rendimento_unidade)
                        st.caption(f":material/schedule: {tempo_txt} ⋅ :material/group: {rend_txt}")
                        if r.categoria:
                            st.markdown(badge(r.categoria.nome, "azul"), unsafe_allow_html=True)
                        if st.button("Ver ficha completa", key=f"abrir_{r.id}", type="primary", use_container_width=True):
                            st.session_state["ficha_selecionada"] = r.nome
                            st.rerun()
                        if usuario.pode_gerenciar_conteudo:
                            rotulo_situacao = "Inativar" if r.ativa else "Reativar"
                            chave_situacao = f"inativar_{r.id}" if r.ativa else f"reativar_{r.id}"
                            if st.button(
                                rotulo_situacao,
                                key=chave_situacao,
                                icon=":material/block:" if r.ativa else ":material/undo:",
                                use_container_width=True,
                            ):
                                r.ativa = not r.ativa
                                registrar(
                                    session, usuario, empresa, "editar", "Receita",
                                    f"{'Reativou' if r.ativa else 'Inativou'} a ficha '{r.nome}'",
                                )
                                session.commit()
                                st.rerun()

                if total_paginas > 1:
                    col_ant, col_info, col_prox = st.columns([1, 2, 1])
                    if col_ant.button("Anterior", icon=":material/chevron_left:", disabled=pagina_atual <= 1, use_container_width=True):
                        st.session_state["pagina_fichas"] = pagina_atual - 1
                        st.rerun()
                    col_info.markdown(
                        f"<div style='text-align:center;padding-top:0.4rem;'>Página {pagina_atual} de {total_paginas}</div>",
                        unsafe_allow_html=True,
                    )
                    if col_prox.button("Próxima", icon=":material/chevron_right:", disabled=pagina_atual >= total_paginas, use_container_width=True):
                        st.session_state["pagina_fichas"] = pagina_atual + 1
                        st.rerun()
            st.stop()

        if escolha == NOVA:
            if st.button("Voltar", icon=":material/arrow_back:", key="voltar_da_criacao"):
                st.session_state["ficha_selecionada"] = LISTA
                st.rerun()
            st.subheader("Nova Ficha Técnica")

            # A origem da foto fica FORA do formulário: dentro de st.form o
            # Streamlit só reexecuta ao enviar, então trocar para "Enviar arquivo"
            # continuava mostrando a câmera. Arquivo vem primeiro pra câmera não
            # ligar sozinha ao abrir a tela.
            st.write("Foto (opcional)")
            metodo_foto = st.radio(
                "Como adicionar a foto",
                [FOTO_ARQUIVO, FOTO_CAMERA, FOTO_LINK],
                horizontal=True,
                label_visibility="collapsed",
                key="nova_foto_metodo",
            )

            with st.form("nova_receita"):
                nome = st.text_input("Nome da receita")
                col_cat, col_dif = st.columns(2)
                nome_categoria = col_cat.selectbox("Categoria", [SEM_CATEGORIA] + [c.nome for c in categorias])
                dificuldade = col_dif.selectbox("Dificuldade", [SEM_DIFICULDADE] + DIFICULDADES)
                col_rend, col_unid = st.columns([2, 1])
                rendimento = col_rend.number_input("Rendimento", min_value=0.01, value=1.0, step=1.0)
                rendimento_unidade = col_unid.selectbox("Unidade", ["un", "pc", "kg", "g", "l", "ml"])
                observacoes = st.text_area("Observações (opcional)", placeholder="Ex: descrição curta do prato")
                validades_nova = _campos_validade("nova")
                st.caption("O modo de preparo (passo a passo) é adicionado depois de criar a ficha.")

                st.write("Foto (opcional)")
                foto_camera = foto_arquivo = None
                foto_link = ""
                if metodo_foto == FOTO_CAMERA:
                    foto_camera = st.camera_input("Tirar foto", label_visibility="collapsed")
                elif metodo_foto == FOTO_ARQUIVO:
                    foto_arquivo = st.file_uploader(
                        "Upload de imagem", type=["png", "jpg", "jpeg", "webp"], label_visibility="collapsed"
                    )
                else:
                    foto_link = st.text_input("Link da foto", label_visibility="collapsed")

                alergenos_marcados = []
                if catalogo_alergenos:
                    st.write("Alérgenos")
                    cols = st.columns(3)
                    for idx, a in enumerate(catalogo_alergenos):
                        rotulo = f":material/{icone_alergeno(a.nome, a.icone)}: {a.nome}"
                        if cols[idx % 3].checkbox(rotulo, key=f"alergeno_novo_{a.id}"):
                            alergenos_marcados.append(a)

                if st.form_submit_button("Criar ficha", type="primary") and nome:
                    ja_existe = session.scalar(
                        select(Receita).where(
                            Receita.empresa_id == empresa.id, Receita.nome == nome
                        )
                    )
                    if ja_existe:
                        st.error("Já existe uma ficha técnica com esse nome.")
                    else:
                        foto_url = foto_link or None
                        if foto_camera is not None:
                            foto_url = salvar_foto(foto_camera.getvalue(), "jpg")
                        elif foto_arquivo is not None:
                            extensao = Path(foto_arquivo.name).suffix or ".jpg"
                            foto_url = salvar_foto(foto_arquivo.getvalue(), extensao)

                        categoria_escolhida = next((c for c in categorias if c.nome == nome_categoria), None)
                        nova = Receita(
                            empresa_id=empresa.id,
                            nome=nome,
                            categoria_id=categoria_escolhida.id if categoria_escolhida else None,
                            rendimento_quantidade=rendimento,
                            rendimento_unidade=rendimento_unidade,
                            foto_url=foto_url,
                            observacoes=observacoes or None,
                            dificuldade=dificuldade if dificuldade != SEM_DIFICULDADE else None,
                            **validades_nova,
                        )
                        nova.alergenos = alergenos_marcados
                        session.add(nova)
                        registrar(session, usuario, empresa, "criar", "Receita", f"Ficha técnica '{nome}'")
                        session.commit()
                        st.session_state["ficha_selecionada"] = nome
                        st.rerun()
            st.stop()

        receita = next((r for r in todas_receitas if r.nome == escolha), None)
        if receita is None:
            st.session_state["ficha_selecionada"] = LISTA
            st.rerun()

        # st.dialog reexecuta só o corpo do modal a cada interação (ex: mudar o
        # multiplicador), sem rerodar o `with get_session()` de fora — por isso
        # materializa os dados em tipos simples aqui, antes de abrir o modal, em
        # vez de acessar `receita.itens`/`receita.passos` (ORM) lá dentro, o que
        # daria DetachedInstanceError (sessão já fechada nesse ponto).
        nome_receita = receita.nome
        rendimento_txt = formatar_quantidade(float(receita.rendimento_quantidade), receita.rendimento_unidade)
        itens_dados = materializar_itens(receita, frozenset({receita.id}))
        passos_dados = [(p.descricao, p.tempo_min) for p in receita.passos]
        impressao_dados = {
            "nome": receita.nome,
            "empresa": empresa.nome,
            "rendimento_quantidade": float(receita.rendimento_quantidade),
            "rendimento_unidade": receita.rendimento_unidade,
            "itens": itens_dados,
            "passos": passos_dados,
            "alergenos": [a.nome for a in receita.alergenos],
            "validades": [
                (rotulo, _texto_dias(getattr(receita, atributo)))
                for atributo, rotulo, _ in VALIDADES
                if getattr(receita, atributo) is not None
            ],
        }

        @st.dialog(f"Preparar Receita: {nome_receita}", width="large")
        def preparar_receita_dialog() -> None:
            # O botão de imprimir vem antes do multiplicador na tela, mas precisa do
            # valor dele: reserva o lugar no topo e preenche depois do number_input.
            col_texto, col_imprimir = st.columns([3, 2], vertical_alignment="center")
            col_texto.caption("Revise os ingredientes calculados — sub-receitas são expandidas nos próprios insumos.")
            lugar_imprimir = col_imprimir.empty()
            multiplicador = st.number_input(
                "Multiplicador", min_value=0.1, value=1.0, step=0.5, format="%.2f"
            )
            st.write(f"**Porções original:** {rendimento_txt}")
            # Imprime já com o multiplicador escolhido. O botão fica num iframe
            # porque a impressão precisa de um documento próprio (ver impressao.py).
            with lugar_imprimir:
                st.iframe(html_impressao(multiplicador=multiplicador, **impressao_dados), height=48)

            st.subheader("Ingredientes (calculados)")
            if itens_dados:
                _renderizar_itens(itens_dados, multiplicador)
            else:
                st.caption("Nenhum insumo cadastrado nesta ficha ainda.")

            if passos_dados:
                st.subheader("Modo de preparo")
                for idx, (descricao, tempo_min) in enumerate(passos_dados):
                    tempo_txt = f" ({tempo_min} min)" if tempo_min else ""
                    st.write(f"{idx + 1}. {descricao}{tempo_txt}")

            if st.button("Fechar", type="primary"):
                st.rerun()

        # ── Cabeçalho: voltar / título / ações (Preparar, Editar) ────────────
        chave_edicao = f"editando_ficha_{receita.id}"
        modo_edicao = usuario.pode_gerenciar_conteudo and st.session_state.get(chave_edicao, False)

        col_voltar, col_titulo, col_acoes = st.columns([0.5, 3.5, 5])
        with col_voltar:
            if st.button("", icon=":material/arrow_back:", help="Voltar para a lista", key="voltar_lista"):
                st.session_state["ficha_selecionada"] = LISTA
                st.rerun()
        with col_titulo:
            st.markdown(
                '<div style="font-size:1.3rem;font-weight:800;">Ficha Técnica</div>'
                '<div style="color:#6B7280;">Detalhes completos da receita</div>',
                unsafe_allow_html=True,
            )
        with col_acoes:
            b_preparar, b_editar = st.columns(2)
            if b_preparar.button("Preparar receita", icon=":material/restaurant:", use_container_width=True):
                preparar_receita_dialog()
            if usuario.pode_gerenciar_conteudo:
                rotulo_edicao = "Concluir edição" if modo_edicao else "Editar ficha"
                if b_editar.button(
                    rotulo_edicao,
                    icon=":material/check:" if modo_edicao else ":material/edit:",
                    type="primary",
                    use_container_width=True,
                    key="toggle_edicao",
                ):
                    st.session_state[chave_edicao] = not modo_edicao
                    st.rerun()

        with st.container(border=True):
            col_nome_ficha, col_btn_situacao = st.columns([4, 1.4], vertical_alignment="center")
            col_nome_ficha.markdown(
                f'<div style="font-size:1.5rem;font-weight:800;">{icone("restaurant")} {receita.nome}</div>'
                f'<div style="color:#6B7280;margin-bottom:0.5rem;">Criada em {data_por_extenso(receita.criado_em)}</div>',
                unsafe_allow_html=True,
            )
            if modo_edicao:
                with col_nome_ficha:
                    _editar_dados_ficha(session, usuario, empresa, receita, categorias)
            if usuario.pode_gerenciar_conteudo:
                rotulo_sit = "Inativar" if receita.ativa else "Reativar"
                ajuda_sit = (
                    "Esconde a ficha da lista padrão e das conferências (não apaga nada)"
                    if receita.ativa
                    else "Volta a mostrar a ficha na lista e nas conferências"
                )
                if col_btn_situacao.button(
                    rotulo_sit,
                    key="inativar_ficha" if receita.ativa else "reativar_ficha",
                    icon=":material/block:" if receita.ativa else ":material/undo:",
                    help=ajuda_sit,
                    use_container_width=True,
                ):
                    receita.ativa = not receita.ativa
                    registrar(
                        session, usuario, empresa, "editar", "Receita",
                        f"{'Reativou' if receita.ativa else 'Inativou'} a ficha '{receita.nome}'",
                    )
                    session.commit()
                    st.rerun()
            st.markdown(
                ("" if receita.ativa else badge("Inativa", "rosa", "block"))
                + (
                    badge("Verificada", "verde", "verified")
                    if receita.verificada
                    else badge("Não verificada", "amarelo", "error")
                ),
                unsafe_allow_html=True,
            )

            if usuario.pode_verificar_ficha:
                with st.container(border=True):
                    col_status, col_acao = st.columns([3, 2])
                    col_status.caption("Revisão técnica")
                    if receita.verificada:
                        status_txt = ":material/verified: Verificada"
                        if receita.verificada_em:
                            status_txt += f" em {data_por_extenso(receita.verificada_em)}"
                    else:
                        status_txt = ":material/error: Status atual: Não verificada"
                    col_status.write(status_txt)
                    rotulo = "Desmarcar verificação" if receita.verificada else "Marcar como verificada"
                    if col_acao.button(rotulo, key="toggle_verificada", type="primary", use_container_width=True):
                        receita.verificada = not receita.verificada
                        receita.verificada_em = dt.datetime.utcnow() if receita.verificada else None
                        registrar(
                            session,
                            usuario,
                            empresa,
                            "editar",
                            "Receita",
                            f"{'Verificou' if receita.verificada else 'Desmarcou verificação de'} a ficha '{receita.nome}'",
                        )
                        session.commit()
                        st.rerun()

            tags = badge(receita.categoria.nome, "azul") if receita.categoria else ""
            if receita.dificuldade:
                tags += badge(receita.dificuldade, "amarelo")
            if tags:
                st.markdown(tags, unsafe_allow_html=True)

            if receita.alergenos:
                pills_alergenos = "".join(badge(a.nome, "amarelo", icone_alergeno(a.nome, a.icone)) for a in receita.alergenos)
                st.markdown(f":material/warning: **Contém alérgenos:** {pills_alergenos}", unsafe_allow_html=True)

            if modo_edicao:
                _editar_alergenos(session, usuario, empresa, receita, catalogo_alergenos)

        insumos_empresa = session.scalars(
            select(Insumo).where(Insumo.empresa_id == empresa.id).order_by(Insumo.nome)
        ).all()

        # ── Foto e dados à esquerda, ingredientes à direita (no celular empilha) ──
        col_foto, col_ingredientes = st.columns([1, 1.15], gap="large")
        with col_foto:
            _foto_detalhe(receita)
            if modo_edicao:
                _editar_foto(session, usuario, empresa, receita)

            tempo_total = sum(p.tempo_min or 0 for p in receita.passos)
            col_tempo, col_rend = st.columns(2)
            col_tempo.markdown(
                stat_box("schedule", f"{tempo_total} min" if tempo_total else "—", "Preparo"), unsafe_allow_html=True
            )
            col_rend.markdown(
                stat_box("group", formatar_quantidade(float(receita.rendimento_quantidade), receita.rendimento_unidade), "Rendimento"),
                unsafe_allow_html=True,
            )

            validades_ficha = [
                (rotulo, icone_nome, getattr(receita, atributo))
                for atributo, rotulo, icone_nome in VALIDADES
                if getattr(receita, atributo) is not None
            ]
            if validades_ficha:
                st.markdown("**Validade**")
                for col, (rotulo, icone_nome, dias) in zip(st.columns(3), validades_ficha):
                    col.markdown(stat_box(icone_nome, _texto_dias(dias), rotulo), unsafe_allow_html=True)

            # Edição da validade fica à vista no modo edição (e não escondida no
            # pop-up "Editar nome e dados", onde passava despercebida).
            if modo_edicao:
                with st.form("editar_validade"):
                    validades_edit = _campos_validade("edit", receita)
                    if st.form_submit_button("Salvar validade", icon=":material/save:", key="salvar_validade"):
                        for atributo, valor in validades_edit.items():
                            setattr(receita, atributo, valor)
                        resumo = ", ".join(
                            f"{rotulo} {validades_edit[atributo] or '—'}" for atributo, rotulo, _ in VALIDADES
                        )
                        registrar(
                            session, usuario, empresa, "editar", "Receita",
                            f"Validade da ficha '{receita.nome}': {resumo}",
                        )
                        session.commit()
                        st.rerun()

        with col_ingredientes:
            # ── Ingredientes ──────────────────────────────────────────────────
            st.subheader(":material/format_list_bulleted: Ingredientes")

            # Ficha inativa não é oferecida como sub-receita nova (as que já estão em
            # uso continuam na composição, só não dá pra adicionar mais).
            sub_receitas_disponiveis = [r for r in todas_receitas if r.id != receita.id and r.ativa]

            if modo_edicao:
                if not insumos_empresa and not sub_receitas_disponiveis:
                    st.warning("Cadastre insumos na página **Insumos** antes de montar a ficha técnica.")
                else:
                    tipo_item = st.radio(
                        "Tipo de item",
                        ["Insumo", "Sub-receita (outra ficha técnica)"],
                        horizontal=True,
                        label_visibility="collapsed",
                    )
                    with st.form("add_item", clear_on_submit=True):
                        if tipo_item == "Insumo":
                            insumo_nome = st.selectbox("Insumo", [i.nome for i in insumos_empresa])
                            col_q, col_u = st.columns([2, 1])
                            quantidade = col_q.number_input("Quantidade", min_value=0.0, step=1.0, format="%g")
                            unidade_insumo = col_u.selectbox("Unidade", UNIDADES)
                        else:
                            sub_receita_nome = st.selectbox(
                                "Ficha técnica", [r.nome for r in sub_receitas_disponiveis]
                            )
                            col_q, col_u = st.columns([2, 1])
                            quantidade = col_q.number_input("Quantidade", min_value=0.0, step=1.0, format="%g")
                            unidade_sub = col_u.selectbox("Unidade", UNIDADES)
                        observacao_item = st.text_input("Observação (opcional)", placeholder="Ex: Câmara refrigerada")
                        if st.form_submit_button("Adicionar à receita", type="primary"):
                            insumo = (
                                next(i for i in insumos_empresa if i.nome == insumo_nome)
                                if tipo_item == "Insumo" and insumos_empresa
                                else None
                            )
                            qtd_base = (
                                converter_unidade(quantidade, unidade_insumo, insumo.unidade_medida) if insumo else None
                            )
                            if insumo and qtd_base is None:
                                st.error(
                                    f"'{insumo.nome}' está cadastrado em {insumo.unidade_medida} — "
                                    f"escolha {' ou '.join(UNIDADES_COMPATIVEIS[insumo.unidade_medida])}."
                                )
                                descricao_log = None
                            elif insumo:
                                session.add(
                                    ReceitaInsumo(
                                        receita_id=receita.id,
                                        insumo_id=insumo.id,
                                        quantidade=qtd_base,
                                        observacao=observacao_item or None,
                                    )
                                )
                                descricao_log = f"Adicionou '{insumo.nome}' à ficha '{receita.nome}'"
                            elif tipo_item != "Insumo" and sub_receitas_disponiveis:
                                sub_receita = next(r for r in sub_receitas_disponiveis if r.nome == sub_receita_nome)
                                session.add(
                                    ReceitaInsumo(
                                        receita_id=receita.id,
                                        sub_receita_id=sub_receita.id,
                                        quantidade=quantidade,
                                        unidade_sub_receita=unidade_sub,
                                        observacao=observacao_item or None,
                                    )
                                )
                                descricao_log = f"Adicionou sub-receita '{sub_receita.nome}' à ficha '{receita.nome}'"
                            else:
                                descricao_log = None
                            if descricao_log:
                                registrar(session, usuario, empresa, "editar", "Receita", descricao_log)
                                session.commit()
                                st.rerun()

            session.refresh(receita)
            if receita.itens:
                with st.container(border=True), st.container(key="lista_ingredientes"):
                    for idx, item in enumerate(receita.itens):
                        if idx > 0:
                            st.divider()
                        c1, c2, c_edit, c3 = st.columns([1.6, 6.4, 0.8, 0.8], vertical_alignment="top")
                        c1.markdown(badge(formatar_quantidade(float(item.quantidade), item.unidade), "verde"), unsafe_allow_html=True)
                        if modo_edicao:
                            with c_edit:
                                _editar_item(session, usuario, empresa, receita, item)
                        if item.sub_receita_id:
                            c2.write(item.nome_item)
                            if c2.button("Ver ficha", icon=":material/open_in_new:", key=f"nav_{item.id}"):
                                st.session_state["ficha_selecionada"] = item.sub_receita.nome
                                st.rerun()
                        else:
                            c2.write(item.nome_item)
                        if item.observacao:
                            c2.caption(item.observacao)
                        if modo_edicao and c3.button("", icon=":material/delete:", key=f"rm_{item.id}", help="Remover"):
                            registrar(
                                session,
                                usuario,
                                empresa,
                                "editar",
                                "Receita",
                                f"Removeu '{item.nome_item}' da ficha '{receita.nome}'",
                            )
                            session.delete(item)
                            session.commit()
                            st.rerun()
            else:
                st.caption("Nenhum insumo adicionado a esta ficha ainda.")

        # ── Modo de Preparo (abaixo dos ingredientes já cadastrados) ─────────
        st.subheader(":material/menu_book: Modo de preparo")

        if modo_edicao:
            with st.form("add_passo", clear_on_submit=True):
                descricao_passo = st.text_area(
                    "Descrição do passo", label_visibility="collapsed", placeholder="Descreva o passo..."
                )
                tempo_passo = st.number_input("Tempo estimado (min)", min_value=0, step=1, value=0)
                if st.form_submit_button("Adicionar passo", type="primary") and descricao_passo:
                    session.add(
                        PassoPreparo(
                            receita_id=receita.id,
                            ordem=len(receita.passos),
                            descricao=descricao_passo,
                            tempo_min=tempo_passo or None,
                        )
                    )
                    registrar(
                        session, usuario, empresa, "editar", "Receita", f"Adicionou passo à ficha '{receita.nome}'"
                    )
                    session.commit()
                    st.rerun()

        session.refresh(receita)
        if receita.passos:
            for idx, passo in enumerate(receita.passos):
                with st.container(border=True):
                    c_ord, c_num, c_desc, c_edit, c_rm = st.columns([0.4, 0.5, 9.2, 0.8, 0.8])
                    if modo_edicao:
                        with c_ord.container(key=f"ordem_{passo.id}"):
                            if idx > 0 and st.button("", icon=":material/keyboard_arrow_up:", key=f"up_{passo.id}", help="Subir"):
                                anterior = receita.passos[idx - 1]
                                passo.ordem, anterior.ordem = anterior.ordem, passo.ordem
                                session.commit()
                                st.rerun()
                            if idx < len(receita.passos) - 1 and st.button("", icon=":material/keyboard_arrow_down:", key=f"down_{passo.id}", help="Descer"):
                                proximo = receita.passos[idx + 1]
                                passo.ordem, proximo.ordem = proximo.ordem, passo.ordem
                                session.commit()
                                st.rerun()
                    c_num.markdown(badge(str(idx + 1), "verde"), unsafe_allow_html=True)
                    c_desc.write(passo.descricao)
                    if passo.tempo_min:
                        c_desc.caption(f":material/schedule: Tempo estimado: {passo.tempo_min} minutos")
                    if modo_edicao:
                        with c_edit:
                            _editar_passo(session, usuario, empresa, receita, passo, idx + 1)
                    if modo_edicao and c_rm.button("", icon=":material/delete:", key=f"rm_passo_{passo.id}", help="Remover"):
                        registrar(
                            session,
                            usuario,
                            empresa,
                            "editar",
                            "Receita",
                            f"Removeu passo da ficha '{receita.nome}'",
                        )
                        session.delete(passo)
                        session.commit()
                        st.rerun()
        else:
            st.caption("Nenhum passo cadastrado ainda.")

        # ── Observações ───────────────────────────────────────────────────
        st.subheader("Observações")
        if receita.observacoes:
            st.info(receita.observacoes)
        elif not modo_edicao:
            st.caption("Nenhuma observação cadastrada.")

        if modo_edicao:
            with st.form("editar_observacoes"):
                novas_observacoes = st.text_area(
                    "Observações", value=receita.observacoes or "", label_visibility="collapsed"
                )
                if st.form_submit_button("Salvar observações"):
                    receita.observacoes = novas_observacoes or None
                    registrar(session, usuario, empresa, "editar", "Receita", f"Editou observações da ficha '{receita.nome}'")
                    session.commit()
                    st.rerun()

            # Cada alteração (item, passo, observação) já é salva na hora — este
            # botão só encerra o modo de edição, mas fica no rodapé pra não
            # precisar rolar a página inteira de volta pro topo pra sair.
            st.divider()
            col_espaco, col_salvar = st.columns([3, 1.5])
            with col_salvar.container(key="salvar_ficha_rodape"):
                if st.button("Salvar ficha técnica", icon=":material/save:", use_container_width=True):
                    st.session_state[chave_edicao] = False
                    st.rerun()
