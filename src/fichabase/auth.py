"""Login (streamlit-authenticator) e regra central de escopo por empresa (multi-tenant).

Toda página que lista/edita dados operacionais deve resolver a empresa atual por
aqui (`empresa_atual`) em vez de reimplementar a lógica de "admin vê tudo, loja só
vê a própria empresa" — é a única fonte de verdade do controle de acesso em Python.
No Postgres, `empresa_atual` também aplica o escopo de RLS (ver `fichabase.rls`) na
mesma sessão, como segunda camada — se algum código futuro esquecer um filtro em
Python, o banco ainda bloqueia o acesso cruzado entre empresas.
"""

from __future__ import annotations

import streamlit as st
import streamlit_authenticator as stauth
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fichabase.config import get_settings
from fichabase.models import Empresa, Usuario
from fichabase.rls import aplicar_escopo_rls


def hash_senha(senha_plana: str) -> str:
    """Hash de senha usando o mesmo Hasher do streamlit-authenticator, para o
    hash gerado no cadastro bater com o formato esperado no login."""
    temp = {"usernames": {"tmp": {"password": senha_plana}}}
    stauth.Hasher.hash_passwords(temp)
    return temp["usernames"]["tmp"]["password"]


def _build_credentials(session: Session) -> dict:
    # Usuário desativado (pages/usuarios.py) simplesmente não entra nas
    # credenciais — pro streamlit-authenticator, é como se a conta não
    # existisse, barrando login novo E invalidando um cookie antigo (LoginError,
    # tratada em app.py, que desloga e volta pra tela de login).
    usuarios = session.scalars(select(Usuario).where(Usuario.ativo)).all()
    return {
        "usernames": {
            u.email: {
                "email": u.email,
                "first_name": u.nome,
                "last_name": "",
                "password": u.senha_hash,
                "logged_in": False,
            }
            for u in usuarios
        }
    }


def get_authenticator(session: Session) -> stauth.Authenticate:
    settings = get_settings()
    credentials = _build_credentials(session)
    return stauth.Authenticate(
        credentials,
        cookie_name="fichabase_auth",
        cookie_key=settings.auth_cookie_key,
        cookie_expiry_days=7,
        auto_hash=False,  # senha_hash já vem hasheada do banco (ver hash_senha)
    )


def usuario_logado(session: Session) -> Usuario | None:
    email = st.session_state.get("username")
    if not email:
        return None
    # Comparação sem diferenciar maiúsculas de propósito: o
    # streamlit-authenticator converte todo username pra minúsculo ao montar
    # as credenciais, então um e-mail cadastrado como "Fulano@x.com" volta
    # aqui como "fulano@x.com" e um "==" simples (que no Postgres diferencia
    # maiúsculas) não acharia o usuário — o login passava, mas toda página
    # ficava em branco porque `usuario` vinha None e caía no st.stop().
    return session.scalar(select(Usuario).where(func.lower(Usuario.email) == email.lower()))


def empresas_visiveis(session: Session, usuario: Usuario) -> list[Empresa]:
    if usuario.eh_admin_master:
        return list(session.scalars(select(Empresa).order_by(Empresa.nome)))
    return [usuario.empresa] if usuario.empresa else []


def empresa_atual(session: Session, usuario: Usuario) -> Empresa | None:
    """Empresa em uso na sessão: fixa para usuário de loja; escolhida via seletor
    na sidebar para o admin_master, que pode transitar entre todas as operações."""
    if usuario.eh_admin_master:
        empresas = empresas_visiveis(session, usuario)
        if not empresas:
            aplicar_escopo_rls(session, usuario, None)
            return None
        nomes = [e.nome for e in empresas]
        escolha = st.sidebar.selectbox("Empresa", nomes, key="empresa_selecionada")
        empresa = next(e for e in empresas if e.nome == escolha)
    else:
        empresa = usuario.empresa

    aplicar_escopo_rls(session, usuario, empresa)
    return empresa
