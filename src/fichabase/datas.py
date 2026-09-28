"""Data e hora no fuso de Fortaleza (UTC-3, sem horário de verão).

O servidor (Streamlit Cloud) roda em UTC: sem isso, depois das 21h o app
sugeriria a data do dia seguinte e o log de acessos mostraria a hora errada.
"""

from __future__ import annotations

import datetime as dt

FUSO_LOCAL = dt.timezone(dt.timedelta(hours=-3))


def agora() -> dt.datetime:
    return dt.datetime.now(FUSO_LOCAL)


def hoje() -> dt.date:
    return agora().date()


def para_local(quando: dt.datetime) -> dt.datetime:
    """Converte um horário gravado em UTC (criado_em) para o fuso local."""
    return quando.replace(tzinfo=dt.UTC).astimezone(FUSO_LOCAL)
