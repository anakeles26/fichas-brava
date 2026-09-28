"""Elementos visuais compartilhados (marca, sidebar escura, badges).

Chamado no topo de cada página pelo mesmo motivo do `auth.require_login`: no
modelo multipage nativo do Streamlit, cada página em `pages/` reexecuta sozinha
sem rerodar `app.py`, então o ajuste de estilo precisa ser repetido em cada uma.
"""

from __future__ import annotations

import datetime as dt
import re
import unicodedata

import streamlit as st

# Paleta "Metas Batidas" do Grupo HosT — verde escuro + dourado, substituindo
# o rosa/azul usado antes. Os nomes das variáveis mudaram (ROSA->VERDE,
# AZUL->DOURADO) mas as classes CSS .fh-badge-rosa/.fh-badge-azul mantiveram
# o nome antigo de propósito: são só chaves internas usadas em dezenas de
# chamadas de badge() espalhadas pelas páginas — trocar o nome delas também
# exigiria editar cada uma dessas chamadas sem nenhum ganho visual.
VERDE = "#1B4332"
DOURADO = "#C9A961"

_MESES_PT = {
    1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril", 5: "maio", 6: "junho",
    7: "julho", 8: "agosto", 9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
}


def data_por_extenso(data: dt.datetime) -> str:
    """Formata em português sem depender do locale do sistema operacional
    (strftime("%B") viraria "February" numa máquina sem locale pt_BR)."""
    return f"{data.day} de {_MESES_PT[data.month]} de {data.year}"


def aplicar_estilo() -> None:
    st.html(
        f"""
        <style>
        /* secondaryBackgroundColor (config.toml) deixa a sidebar escura, mas o
        textColor do tema é escuro (pensado pro conteúdo principal, que é
        claro) — sem isso o texto do menu fica ilegível sobre o fundo escuro. */
        [data-testid="stSidebar"] {{
            color: #E7E9EE;
        }}
        [data-testid="stSidebar"] p,
        [data-testid="stSidebar"] span,
        [data-testid="stSidebar"] label,
        [data-testid="stSidebar"] li a {{
            color: #E7E9EE !important;
        }}

        /* Ordem da sidebar. O Streamlit desenha o menu (stSidebarNav) e o
        conteúdo do `with st.sidebar:` (stSidebarUserContent) em blocos
        fixos, que não dá pra reordenar pelo código Python — então a ordem
        visual (logo/empresa em cima, menu no meio, "Sair" no rodapé) é
        montada aqui com flexbox.

        Os `display: contents` "dissolvem" os blocos intermediários do
        Streamlit para que cada elemento vire item direto deste flex e possa
        receber `order` individualmente — é isso que permite mandar só o
        botão "Sair" (classe st-key-Logout, gerada pela key do widget) pra
        depois do menu, mantendo tudo no fluxo normal.

        Versão anterior usava position:absolute no "Sair": como a sidebar
        rola, o botão ficava preso à área visível enquanto o menu rolava por
        baixo, cobrindo o último item ("Auditoria e Logs"). Com `margin-top:
        auto` ele desce até o rodapé sem sair do fluxo, então nunca sobrepõe
        nada, com o menu grande ou a janela baixa. */
        [data-testid="stSidebarContent"] {{
            display: flex;
            flex-direction: column;
            row-gap: 0.4rem;
        }}
        [data-testid="stSidebarHeader"] {{ order: 0; }}
        [data-testid="stSidebarUserContent"],
        [data-testid="stSidebarUserContent"] > div,
        [data-testid="stSidebarUserContent"] [data-testid="stVerticalBlock"] {{
            display: contents;
        }}
        [data-testid="stSidebarUserContent"] [data-testid="stElementContainer"] {{
            order: 1;
            padding: 0 1rem;
        }}
        [data-testid="stSidebarNav"] {{
            order: 2;
            margin-top: 1.25rem;
        }}
        [data-testid="stSidebarContent"] .st-key-Logout {{
            order: 3;
            margin-top: auto;
            padding: 1rem;
        }}

        /* O mesmo secondaryBackgroundColor também vira o fundo de campo de
        formulário (input/select/textarea) em qualquer lugar da tela, não só
        na sidebar — sem isso os campos ficam escuros com texto escuro por
        cima (ilegível) no conteúdo principal, que é claro. */
        [data-testid="stTextInputRootElement"],
        [data-testid="stNumberInputContainer"],
        [data-testid="stTextAreaRootElement"],
        [data-testid="stSelectbox"] [role="group"],
        [data-testid="stMultiSelect"] [role="group"],
        [data-testid="stDateInputField"] {{
            background-color: #FFFFFF !important;
            border: 1px solid #D8DCE3 !important;
        }}
        [data-testid="stTextInputRootElement"] input,
        [data-testid="stNumberInputContainer"] input,
        [data-testid="stTextAreaRootElement"] textarea,
        [data-testid="stSelectbox"] input,
        [data-testid="stMultiSelect"] input,
        [data-testid="stDateInputField"] input {{
            color: #1A1A1A !important;
        }}

        /* Área de envio de arquivo (foto da ficha, planilha de insumos): o
        mesmo secondaryBackgroundColor escuro deixava o quadro verde-escuro com
        o texto ilegível. Fundo claro, borda tracejada e texto cinza. */
        [data-testid="stFileUploaderDropzone"] {{
            background-color: #F7F9F8 !important;
            border: 1.5px dashed #C9D3CD !important;
            border-radius: 10px !important;
        }}
        [data-testid="stFileUploaderDropzone"]:hover {{
            border-color: {VERDE} !important;
            background-color: #EEF4F0 !important;
        }}
        [data-testid="stFileUploaderDropzoneInstructions"],
        [data-testid="stFileUploaderDropzoneInstructions"] * {{
            color: #6B7280 !important;
        }}
        [data-testid="stFileUploaderDropzone"] button {{
            background-color: #FFFFFF !important;
            color: {VERDE} !important;
            border: 1px solid #D8DCE3 !important;
        }}
        [data-testid="stFileUploader"] [data-testid="stFileUploaderFile"],
        [data-testid="stFileUploaderFileName"] {{
            color: #1A1A1A !important;
        }}

        /* Botões ▲▼ de reordenar passo do modo de preparo
        (fichas_tecnicas.py) — versão compacta, sem o padding padrão enorme
        do botão do Streamlit, pra parecer um ícone pequeno e não um botão
        de formulário. */
        [class*="st-key-ordem_"] button {{
            padding: 0.05rem 0.5rem !important;
            min-height: 1.7rem !important;
            line-height: 1.2 !important;
        }}

        /* Botão Inativar/Reativar ao lado do nome da ficha
        (fichas_tecnicas.py) — compacto, pra ficar discreto no cabeçalho. */
        .st-key-inativar_ficha button,
        .st-key-reativar_ficha button {{
            padding: 0.15rem 0.6rem !important;
            min-height: 2rem !important;
            font-size: 0.85rem !important;
            white-space: nowrap !important;
        }}
        .st-key-inativar_ficha button p,
        .st-key-reativar_ficha button p {{
            white-space: nowrap !important;
        }}

        /* Ações de inativar/desativar (fichas e usuários): fundo vermelho
        claro pra sinalizar ação de "tirar de uso" sem parecer exclusão
        definitiva. A key do widget começa com inativar_/desativar_ e vira a
        classe st-key-(nome da key). Nada com cara de tag HTML nos comentários
        deste CSS: o st.html descarta o bloco de estilo inteiro se encontrar. */
        [class*="st-key-inativar_"] button,
        [class*="st-key-desativar_"] button {{
            background-color: #FDECEC !important;
            color: #B42318 !important;
            border: 1px solid #F5C2C0 !important;
        }}
        [class*="st-key-inativar_"] button:hover,
        [class*="st-key-desativar_"] button:hover {{
            background-color: #FAD7D5 !important;
            border-color: #EFA6A2 !important;
            color: #912018 !important;
        }}

        /* Barra de progresso (Auditorias): o trilho herda a cor secundária
           escura do tema e some contra o preenchimento verde — clareia. */
        [data-testid="stProgressBarTrack"] {{
            background-color: #E3EDE7 !important;
        }}

        /* Botão "Salvar Ficha Técnica" no rodapé do modo de edição
        (fichas_tecnicas.py) — verde sólido, cor própria dessa ação (não é
        rosa da marca porque aqui o verde reforça "ação de confirmar/salvar",
        igual ao "Marcar como verificada"). */
        [class*="st-key-salvar_ficha_rodape"] button {{
            background-color: #1EA34D !important;
            color: #FFFFFF !important;
            border: 1px solid #1EA34D !important;
        }}
        [class*="st-key-salvar_ficha_rodape"] button:hover {{
            background-color: #178A40 !important;
            border-color: #178A40 !important;
            color: #FFFFFF !important;
        }}

        /* Lista de ingredientes (fichas_tecnicas.py) — o espaçamento padrão
        do Streamlit entre blocos deixava cada linha "flutuando" longe da
        próxima; aqui aperta pra ficar uma lista compacta de verdade. */
        [class*="st-key-lista_ingredientes"] [data-testid="stElementContainer"] {{
            margin-bottom: 0 !important;
        }}
        [class*="st-key-lista_ingredientes"] hr {{
            margin: 0.35rem 0 !important;
        }}

        .fh-badge {{
            display: inline-block;
            padding: 2px 10px;
            border-radius: 999px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-right: 6px;
            white-space: nowrap;
        }}
        .fh-badge-rosa {{ background: #E3ECE6; color: {VERDE}; }}
        .fh-badge-azul {{ background: #F5EAD3; color: #8A6D1F; }}
        .fh-badge-verde {{ background: #DCF3E3; color: #1E8449; }}
        .fh-badge-amarelo {{ background: #FCF0D9; color: #92710A; }}

        /* Ícone de linha monocromático dentro de HTML próprio (selos,
        caixas de resumo) — mesma fonte Material Symbols que o Streamlit já
        carrega para os ícones de botão/menu, então herda a cor do texto em
        vez de trazer as cores de um emoji. */
        .fh-icon {{
            font-family: "Material Symbols Rounded";
            font-weight: normal;
            font-style: normal;
            font-size: 1.15em;
            line-height: 1;
            vertical-align: -0.2em;
            display: inline-block;
            letter-spacing: normal;
            text-transform: none;
            white-space: nowrap;
            direction: ltr;
            font-feature-settings: "liga";
            -webkit-font-smoothing: antialiased;
        }}
        .fh-badge .fh-icon {{ margin-right: 3px; }}

        /* Título "Ficha" + marca HOST. Flex com a imagem encolhível: a
        largura da sidebar muda com a tela/zoom do navegador, e com tamanho
        fixo a marca era cortada. O ícone e o "Ficha" não encolhem; a marca
        HOST ocupa o que sobrar (até a altura máxima), mantendo a proporção. */
        .fh-logo {{
            display: flex;
            align-items: center;
            gap: 0.4rem;
            font-weight: 800;
            white-space: nowrap;
            min-width: 0;
            max-width: 100%;
        }}
        .fh-logo svg {{
            flex: none;
            width: auto;
            margin: 0 !important;
            vertical-align: baseline !important;
        }}
        .fh-logo-texto {{ flex: none; }}
        .fh-logo img {{
            flex: 0 1 auto;
            min-width: 0;
            max-width: 100%;
            height: auto;
        }}

        .fh-stat-box {{
            border: 1px solid #E5E7EB;
            border-radius: 10px;
            padding: 0.75rem 1rem;
            text-align: center;
        }}
        .fh-stat-box .fh-stat-valor {{ font-size: 1.4rem; font-weight: 700; }}
        .fh-stat-box .fh-stat-label {{ font-size: 0.75rem; color: #6B7280; }}
        </style>
        """
    )


# Ícone próprio (chapéu de chef sobre quadrado arredondado) — desenho do
# zero em SVG, na cor da marca, no espírito do ícone de app que a Ana pediu.
_ICONE_LOGO = f"""
<svg viewBox="0 0 100 100" style="height:2.1rem;vertical-align:-0.5rem;margin-right:0.4rem;">
  <rect x="0" y="0" width="100" height="100" rx="22" fill="{VERDE}"/>
  <circle cx="32" cy="46" r="15" fill="#FFFFFF"/>
  <circle cx="68" cy="46" r="15" fill="#FFFFFF"/>
  <ellipse cx="50" cy="40" rx="24" ry="21" fill="#FFFFFF"/>
  <rect x="30" y="58" width="40" height="22" rx="5" fill="#FFFFFF"/>
</svg>
"""


# Mesmo ícone, mas com o quadrado em dourado — usado só na tela de login,
# onde o fundo passa a ser o próprio verde da marca (o ícone verde original
# ficaria invisível, verde sobre verde).
_ICONE_LOGO_LOGIN = f"""
<svg viewBox="0 0 100 100" style="height:2.8rem;vertical-align:-0.6rem;margin-right:0.5rem;">
  <rect x="0" y="0" width="100" height="100" rx="22" fill="{DOURADO}"/>
  <circle cx="32" cy="46" r="15" fill="#FFFFFF"/>
  <circle cx="68" cy="46" r="15" fill="#FFFFFF"/>
  <ellipse cx="50" cy="40" rx="24" ry="21" fill="#FFFFFF"/>
  <rect x="30" y="58" width="40" height="22" rx="5" fill="#FFFFFF"/>
</svg>
"""


def fundo_verde_login() -> None:
    """Fundo verde da marca — só na tela de login (não pode ir em
    aplicar_estilo, que roda em toda página; as demais usam fundo claro)."""
    st.html(
        f"""
        <style>
        [data-testid="stAppViewContainer"] {{ background: {VERDE}; }}
        [data-testid="stAppViewContainer"] [data-testid="stCaptionContainer"],
        [data-testid="stAppViewContainer"] [data-testid="stHeading"] *,
        [data-testid="stAppViewContainer"] [data-testid="stWidgetLabel"] * {{
            color: #E7E9EE !important;
        }}
        /* Um pouco de respiro no topo — sem isso, barras/extensões do
        próprio navegador (fora do nosso controle) às vezes cobrem a logo. */
        [data-testid="stMainBlockContainer"] {{
            padding-top: 2.5rem;
            padding-bottom: 1rem;
        }}
        </style>
        """
    )


# Segunda parte do nome do app, ao lado de "Ficha" (ver _titulo). Trocar aqui
# muda o nome mostrado no topo e na tela de login.
MARCA = "Base"


def _marca(cor: str) -> str:
    """Parte destacada do nome, em caixa e com fundo da cor da marca."""
    fundo, texto = (DOURADO, "#1A1A1A") if cor == "dourado" else ("#FFFFFF", VERDE) if cor == "claro" else (VERDE, "#FFFFFF")
    return (
        f'<span style="background:{fundo};color:{texto};padding:0 0.35em;'
        f'border-radius:0.15em;letter-spacing:0.12em;">{MARCA.upper()}</span>'
    )


def _titulo(icone_svg: str, cor_marca: str, tamanho: str, estilo_div: str = "", cor_texto: str = "") -> str:
    cor = f"color:{cor_texto};" if cor_texto else ""
    return (
        f'<div class="fh-logo" style="font-size:{tamanho};{estilo_div}">'
        f"{icone_svg}"
        f'<span class="fh-logo-texto" style="{cor}">Ficha</span>'
        f"{_marca(cor_marca)}"
        f"</div>"
    )


def logo_centralizada() -> None:
    """Logo grande e centralizada, usada acima do formulário de login
    (fundo verde) — versão maior e com cores claras da `logo()` normal, que é
    pensada pro fundo branco do restante do app."""
    st.markdown(
        _titulo(
            _ICONE_LOGO_LOGIN, "dourado", "2.6rem",
            estilo_div="justify-content:center;margin:0 0 1rem;", cor_texto="#FFFFFF",
        ),
        unsafe_allow_html=True,
    )


def esconder_sidebar() -> None:
    """Usado na tela de login: sem isso, o menu de navegação (st.navigation)
    aparece na lateral mesmo antes de autenticar, expondo a estrutura do app
    e ocupando espaço numa tela que não tem nada pra navegar ainda."""
    st.html('<style>[data-testid="stSidebar"] { display: none; }</style>')


def logo(fundo_escuro: bool = True) -> None:
    """Título "Ficha" + marca HOST. Na sidebar (fundo escuro) a marca é clara,
    mesma cor que o CSS da sidebar já dava ao texto "HosT"; no conteúdo
    principal (fundo branco) é verde, a cor original do "HosT"."""
    st.markdown(
        _titulo(_ICONE_LOGO, "claro" if fundo_escuro else "verde", "2rem", estilo_div="margin-bottom:0.25rem;"),
        unsafe_allow_html=True,
    )


# Ícone de linha de cada alérgeno do catálogo padrão (seed.py). A biblioteca
# Material Symbols não tem desenho específico pra todo alimento (não existe
# "castanha" nem "camarão"), então usa o mais próximo. Chave: nome sem acento
# e em minúsculas, pra "Glúten" e "gluten" darem no mesmo ícone.
ICONES_ALERGENOS = {
    "amendoas": "nutrition",
    "amendoim": "eco",
    "castanha": "avocado_bean",
    "corante": "palette",
    "crustaceos": "waves",
    "gluten": "bakery_dining",
    "lactose": "local_drink",
    "leite": "water_full",
    "ovo": "egg",
    "peixe": "set_meal",
    "soja": "psychiatry",
}
ICONE_ALERGENO_PADRAO = "warning"

# Opções oferecidas ao cadastrar um alérgeno novo.
OPCOES_ICONE_ALERGENO = [
    ICONE_ALERGENO_PADRAO,
    *dict.fromkeys(ICONES_ALERGENOS.values()),
    "grain",
    "cookie",
    "icecream",
    "local_cafe",
    "liquor",
    "science",
    "water_drop",
]


def _sem_acento(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    ).strip().lower()


def icone_alergeno(nome: str, icone_salvo: str | None = None) -> str:
    """Nome do ícone Material de um alérgeno. `icone_salvo` só vale se já for
    um nome de ícone (ex: "egg"); emojis gravados antigamente são ignorados
    e caem no mapa por nome."""
    if icone_salvo and re.fullmatch(r"[a-z0-9_]+", icone_salvo):
        return icone_salvo
    return ICONES_ALERGENOS.get(_sem_acento(nome), ICONE_ALERGENO_PADRAO)


# Cor de fundo/texto das células de status (Acima / Ok / Abaixo) nas tabelas
# de rendimento. Mesmos tons dos selos (.fh-badge-*), em versão semáforo:
# Acima = perda maior que o aceitável (vermelho); Abaixo = perda menor que o
# esperado, geralmente erro de pesagem ou ficha desatualizada (amarelo).
CORES_STATUS = {
    "Acima": "background-color: #FDECEC; color: #B42318; font-weight: 600",
    "Abaixo": "background-color: #FEF3C7; color: #92400E; font-weight: 600",
    "Ok": "background-color: #DCF3E3; color: #1E8449; font-weight: 600",
    # Auditoria de padrão de porção
    "Aprovado": "background-color: #DCF3E3; color: #1E8449; font-weight: 600",
    "Reprovado": "background-color: #FDECEC; color: #B42318; font-weight: 600",
}


def colorir_status(df, colunas: list[str]):
    """Styler do pandas com as células de status coloridas — st.dataframe
    aceita o Styler direto e mantém ordenação/busca da tabela."""
    return df.style.map(lambda valor: CORES_STATUS.get(valor, ""), subset=[c for c in colunas if c in df.columns])


def icone(nome: str) -> str:
    """Ícone Material Symbols (ex: "schedule", "check_circle") para usar
    dentro de HTML. Em texto Markdown do Streamlit use `:material/nome:`."""
    return f'<span class="fh-icon">{nome}</span>'


def badge(texto: str, cor: str = "rosa", icone_nome: str | None = None) -> str:
    conteudo = f"{icone(icone_nome)}{texto}" if icone_nome else texto
    return f'<span class="fh-badge fh-badge-{cor}">{conteudo}</span>'


def stat_box(icone_nome: str, valor: str, label: str) -> str:
    return (
        '<div class="fh-stat-box">'
        f'<div class="fh-stat-valor">{icone(icone_nome)} {valor}</div>'
        f'<div class="fh-stat-label">{label}</div>'
        "</div>"
    )
