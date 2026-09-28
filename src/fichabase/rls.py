"""Aplica o escopo de Row-Level Security (RLS) na sessão do Postgres.

O RLS em si (ativar + criar as políticas) vive em `sql/rls_policies.sql` —
DDL de segurança não é algo que o SQLAlchemy expresse via ORM, então fica
como SQL puro, aplicado uma vez no banco. Este módulo é o lado da aplicação:
antes de qualquer query de dado operacional, avisa ao Postgres "quem está
perguntando" via variáveis de sessão (`set_config`), que as políticas leem
com `current_setting(...)`.

Sem efeito no SQLite (usado hoje em dev): RLS não existe lá, e o filtro
Python em `fichabase.auth.empresa_atual` continua sendo a única camada de
proteção nesse ambiente — RLS é uma camada *adicional* no Postgres, não uma
substituição da lógica em Python.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from fichabase.models import Empresa, Usuario


def aplicar_escopo_rls(session: Session, usuario: Usuario, empresa: Empresa | None) -> None:
    if session.get_bind().dialect.name != "postgresql":
        return

    # set_config(..., is_local=true) equivale a um SET LOCAL parametrizado —
    # dura só a transação atual, sem risco de "vazar" pra próxima requisição
    # se a conexão voltar pro pool (SET simples, sem LOCAL, vazaria).
    session.execute(
        text("SELECT set_config('app.current_empresa_id', :v, true)"),
        {"v": str(empresa.id) if empresa else "0"},
    )
    session.execute(
        text("SELECT set_config('app.is_admin_master', :v, true)"),
        {"v": "true" if usuario.eh_admin_master else "false"},
    )
