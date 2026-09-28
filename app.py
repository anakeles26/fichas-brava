"""Entrypoint do FichaBase: login + navegação.

Com `st.navigation`, toda página passa por aqui a cada troca de tela — por
isso o login, o CSS e o `st.set_page_config` só precisam existir neste
arquivo, em vez de repetidos em cada página (era necessário no modelo antigo
de `pages/` com nomes numerados).
"""

from __future__ import annotations

import streamlit as st
from streamlit_authenticator.utilities.exceptions import LoginError

from fichabase.auth import get_authenticator, hash_senha, usuario_logado
from fichabase.db import get_session
from fichabase.models import Acesso
from fichabase.rls import aplicar_escopo_rls
from fichabase.senha import senha_valida
from fichabase.ui import (
    aplicar_estilo,
    esconder_sidebar,
    fundo_verde_login,
    logo,
    logo_centralizada,
)

st.set_page_config(page_title="FichaBase", page_icon=":material/restaurant_menu:", layout="wide")
aplicar_estilo()

# Placeholder criado ANTES do formulário de login (authenticator.login, logo
# abaixo) pra poder desenhar a logo centralizada ACIMA dele — o Streamlit só
# sabe se a pessoa já está logada depois de chamar login(), mas visualmente a
# logo precisa aparecer antes do formulário na tela.
topo_login = st.empty()

with get_session() as session:
    authenticator = get_authenticator(session)
    try:
        authenticator.login(location="main")
    except LoginError:
        # Cookie de sessão válido, mas apontando pra um usuário que não
        # existe mais (ex: conta apagada/desativada) — sem isso, a tela
        # quebra com uma exceção não tratada em vez de simplesmente pedir
        # login de novo. O rerun é necessário: o próprio login() lançou a
        # exceção ANTES de desenhar o formulário nesta rodada — sem recarregar,
        # a tela fica em branco (nem erro, nem formulário) até a pessoa dar
        # F5 na mão.
        authenticator.cookie_controller.delete_cookie()
        st.session_state["authentication_status"] = None
        st.rerun()

status = st.session_state.get("authentication_status")

if status is False:
    esconder_sidebar()
    fundo_verde_login()
    with topo_login.container():
        logo_centralizada()
    st.error("Email ou senha incorretos.")
    st.stop()
elif status is None:
    esconder_sidebar()
    fundo_verde_login()
    with topo_login.container():
        logo_centralizada()
    st.caption("Sistema de fichas técnicas")
    st.stop()

# Log de acessos: uma linha por sessão (não por página). O flag na sessão
# evita repetir o registro a cada rerun; ao fechar o navegador e entrar de
# novo, a sessão é outra e o acesso é registrado outra vez.
if not st.session_state.get("acesso_registrado"):
    with get_session() as session:
        usuario = usuario_logado(session)
        if usuario is not None:
            # Sem o escopo, a política de RLS da tabela recusa a gravação.
            aplicar_escopo_rls(session, usuario, usuario.empresa)
            session.add(Acesso(usuario_id=usuario.id, empresa_id=usuario.empresa_id))
            session.commit()
            st.session_state["acesso_registrado"] = True

# Primeiro acesso (senha provisória gerada na criação do usuário, ver
# pages/usuarios.py): trava a navegação até definir uma senha só da pessoa.
# Fica DEPOIS do login (não antes) porque só sabemos que a senha é provisória
# depois que streamlit-authenticator já validou a senha atual.
with get_session() as session:
    usuario = usuario_logado(session)
    if usuario is not None and usuario.senha_provisoria:
        logo(fundo_escuro=False)
        st.subheader("Crie sua senha")
        st.caption("Este é seu primeiro acesso — defina uma senha só sua antes de continuar.")
        with st.form("trocar_senha_provisoria"):
            nova_senha = st.text_input("Nova senha", type="password", placeholder="••••••")
            confirmar_nova = st.text_input("Confirmar nova senha", type="password", placeholder="••••••")
            st.caption("Mínimo 6 caracteres, pelo menos 1 letra e 1 número/especial.")
            if st.form_submit_button("Salvar senha", type="primary") and nova_senha:
                if nova_senha != confirmar_nova:
                    st.error("As senhas não coincidem.")
                elif not senha_valida(nova_senha):
                    st.error(
                        "A senha precisa ter no mínimo 6 caracteres, com pelo menos 1 letra e 1 número/especial."
                    )
                else:
                    usuario.senha_hash = hash_senha(nova_senha)
                    usuario.senha_provisoria = False
                    session.commit()
                    st.success("Senha definida com sucesso!")
                    st.rerun()
        st.stop()

with st.sidebar:
    logo()
    st.write(f"Olá, **{st.session_state.get('name')}**")
    authenticator.logout("Sair", location="sidebar")

# Permissões lidas enquanto a sessão está aberta: depois do `with`, o objeto
# Usuario fica desconectado do banco. As páginas continuam checando a
# permissão por conta própria — esconder do menu não substitui essa trava,
# porque alguém pode abrir a página direto pela URL.
with get_session() as session:
    usuario = usuario_logado(session)
    eh_master = bool(usuario and usuario.eh_admin_master)
    gerencia = bool(usuario and usuario.pode_gerenciar_conteudo)
    cria_usuario = bool(usuario and usuario.pode_criar_usuario)

secoes = {
    "": [
        st.Page("pages/dashboard.py", title="Dashboard", icon=":material/dashboard:", default=True),
        st.Page("pages/fichas_tecnicas.py", title="Fichas Técnicas", icon=":material/receipt_long:"),
        st.Page("pages/insumos.py", title="Insumos", icon=":material/inventory_2:"),
    ],
}
secoes["Configurações"] = [
    st.Page("pages/categorias.py", title="Categorias", icon=":material/sell:"),
    st.Page("pages/alergenos.py", title="Alérgenos", icon=":material/warning:"),
    *([st.Page("pages/usuarios.py", title="Usuários", icon=":material/group:")] if cria_usuario else []),
    *([st.Page("pages/auditoria.py", title="Auditoria e Logs", icon=":material/history:"),
       st.Page("pages/log_acessos.py", title="Log de acessos", icon=":material/login:")] if gerencia else []),
]

pagina = st.navigation(secoes)
pagina.run()
