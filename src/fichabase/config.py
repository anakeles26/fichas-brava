"""Configuração central da aplicação, carregada de variáveis de ambiente/.env."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolvido a partir da localização do pacote (não do cwd do processo), para que o
# Streamlit funcione igual não importa de onde seja invocado.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _PROJECT_ROOT / ".env"


def _load_streamlit_secrets() -> None:
    """No Streamlit Community Cloud a config vem de `st.secrets` (secrets.toml),
    não de variáveis de ambiente reais. Copia para `os.environ` antes de o
    pydantic-settings ler, para o mesmo `Settings` funcionar local e em produção."""
    try:
        import streamlit as st

        for key, value in st.secrets.items():
            os.environ.setdefault(key.upper(), str(value))
    except Exception:  # noqa: BLE001, S110 - streamlit ausente ou sem secrets.toml têm exceções diferentes por versão
        pass


_load_streamlit_secrets()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./fichabase.db"
    auth_cookie_key: str = "troque_esta_chave"
    log_level: str = "INFO"

    # E-mail transacional (Resend) — senha provisória no primeiro acesso.
    # Vazio = envio desligado (fichabase/email.py levanta EmailError, tratado
    # no chamador). resend_from precisa ser um domínio verificado no Resend
    # pra mandar pra qualquer destinatário — "onboarding@resend.dev" só
    # entrega pro próprio e-mail dono da conta Resend.
    resend_api_key: str = ""
    resend_from: str = "FichaBase <onboarding@resend.dev>"

    # Storage de fotos das fichas técnicas (Supabase Storage) — substitui o
    # disco local (fichabase/fotos.py), que some a cada reinício/deploy no
    # Streamlit Community Cloud. service_role (não a anon key): faz upload
    # por trás, sem passar pela RLS do Storage.
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "fotos-fichas"

    @property
    def resolved_database_url(self) -> str:
        """`database_url` com caminhos sqlite relativos ancorados na raiz do projeto
        em vez do cwd do processo (mesmo motivo do _ENV_FILE acima)."""
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix):
            return self.database_url
        path_part = self.database_url[len(prefix) :]
        if path_part.startswith("/") or ":" in path_part[:3] or path_part == ":memory:":
            return self.database_url  # já é absoluto (unix) ou tem drive letter (windows) ou é in-memory
        return f"{prefix}{(_PROJECT_ROOT / path_part).resolve().as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
