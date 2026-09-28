"""Importação de insumos a partir de planilha (Excel/CSV).

A lógica fica aqui, fora da página, por dois motivos: a página do Streamlit
não é testável sem simular upload de arquivo, e a mesma regra pode ser
reaproveitada por um script de linha de comando no futuro.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy.orm import Session

from fichabase.models import CATEGORIA_INSUMO, Categoria, Empresa, Insumo

COLUNAS_MODELO = ("Nome", "Unidade", "Categoria")

_EXEMPLOS = [
    ("arroz branco", "kg", "Mercearia"),
    ("óleo de soja", "litro", "Mercearia"),
    ("camarão limpo", "kg", "Frios"),
    ("pão bao", "un", "Padaria"),
]

# Variações que aparecem nas planilhas -> unidade usada no sistema.
UNIDADE_MAP = {
    "kg": "kg", "quilo": "kg", "quilos": "kg", "kilo": "kg",
    "g": "g", "gr": "g", "grama": "g", "gramas": "g",
    "l": "l", "lt": "l", "litro": "l", "litros": "l",
    "ml": "ml", "mililitro": "ml",
    "un": "un", "und": "un", "unid": "un", "unidade": "un", "unidades": "un",
    "pc": "pc", "pç": "pc", "peca": "pc", "peça": "pc",
}


def normalizar_unidade(valor: object) -> str:
    """Unidade da planilha -> unidade do sistema. Desconhecida vira "un"."""
    return UNIDADE_MAP.get(str(valor or "").strip().lower(), "un")


def _texto(valor: object) -> str:
    """Célula da planilha -> texto limpo. Célula vazia no pandas vira o
    float NaN, que em str() vira a string "nan" — daí o descarte explícito."""
    texto = str(valor or "").strip()
    return "" if texto.lower() == "nan" else texto


@dataclass
class ResultadoImportacao:
    criados: int = 0
    ignorados: int = 0
    categorias_criadas: list[str] = field(default_factory=list)


def gerar_planilha_modelo() -> bytes:
    """Planilha em branco pra quem vai cadastrar insumos em lote.

    A primeira aba ("Insumos") vem só com o cabeçalho de propósito: é ela
    que a importação lê, então baixar o modelo e importar sem preencher não
    cria nada por engano. Os exemplos ficam numa segunda aba, só como
    referência de preenchimento."""
    wb = Workbook()

    aba = wb.active
    aba.title = "Insumos"
    aba.append(list(COLUNAS_MODELO))
    for celula in aba[1]:
        celula.font = Font(name="Arial", bold=True, color="FFFFFF")
        celula.fill = PatternFill("solid", fgColor="1B4332")  # verde da marca
        celula.alignment = Alignment(horizontal="center")
    aba.column_dimensions["A"].width = 38
    aba.column_dimensions["B"].width = 14
    aba.column_dimensions["C"].width = 24
    aba.freeze_panes = "A2"

    ajuda = wb.create_sheet("Como preencher")
    linhas_ajuda = [
        ("Como preencher a planilha de insumos", "", ""),
        ("", "", ""),
        ("1. Preencha os insumos na aba 'Insumos' (esta aba é só referência).", "", ""),
        ("2. 'Nome' é obrigatório. 'Unidade' e 'Categoria' podem ficar vazias.", "", ""),
        ("3. Unidade aceita variações: kg, quilo, g, gramas, l, litro, ml, un, unidade, pc.", "", ""),
        ("   Se ficar vazia ou não for reconhecida, entra como 'un'.", "", ""),
        ("4. Categoria que ainda não existe é criada na importação (se você marcar a opção).", "", ""),
        ("5. Insumo com nome já cadastrado é ignorado — nada é sobrescrito.", "", ""),
        ("", "", ""),
        ("Exemplo de preenchimento:", "", ""),
        COLUNAS_MODELO,
        *_EXEMPLOS,
    ]
    for linha in linhas_ajuda:
        ajuda.append(list(linha))
    ajuda["A1"].font = Font(name="Arial", bold=True, size=13)
    for celula in ajuda[11]:  # linha do cabeçalho do exemplo
        celula.font = Font(name="Arial", bold=True)
    ajuda.column_dimensions["A"].width = 85
    ajuda.column_dimensions["B"].width = 14
    ajuda.column_dimensions["C"].width = 24

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def localizar_colunas(df: pd.DataFrame) -> dict[str, object | None]:
    """Acha as colunas Nome/Unidade/Categoria sem depender de maiúsculas,
    acentos de espaçamento ou ordem."""
    colunas = {str(c).strip().lower(): c for c in df.columns}
    return {
        "nome": colunas.get("nome"),
        "unidade": colunas.get("unidade") or colunas.get("unidade de medida"),
        "categoria": colunas.get("categoria"),
    }


def importar_insumos(
    session: Session,
    empresa: Empresa,
    df: pd.DataFrame,
    categorias: list[Categoria],
    criar_categorias: bool = True,
) -> ResultadoImportacao:
    """Cria os insumos da planilha que ainda não existem na empresa.

    Nunca sobrescreve: insumo com nome já cadastrado (ignorando maiúsculas)
    é contado como ignorado. Não faz commit — quem chama decide."""
    colunas = localizar_colunas(df)
    col_nome = colunas["nome"]
    if col_nome is None:
        raise ValueError("A planilha precisa de uma coluna chamada 'Nome'.")

    resultado = ResultadoImportacao()
    existentes = {
        i.nome.strip().lower()
        for i in session.query(Insumo).filter(Insumo.empresa_id == empresa.id)
    }
    cat_por_nome = {c.nome.strip().lower(): c for c in categorias}

    for _, linha in df.iterrows():
        nome = _texto(linha[col_nome])
        if not nome:
            continue
        if nome.lower() in existentes:
            resultado.ignorados += 1
            continue

        categoria = None
        if colunas["categoria"] is not None:
            nome_cat = _texto(linha[colunas["categoria"]])
            if nome_cat:
                categoria = cat_por_nome.get(nome_cat.lower())
                if categoria is None and criar_categorias:
                    categoria = Categoria(empresa_id=empresa.id, tipo=CATEGORIA_INSUMO, nome=nome_cat)
                    session.add(categoria)
                    session.flush()
                    cat_por_nome[nome_cat.lower()] = categoria
                    resultado.categorias_criadas.append(nome_cat)

        unidade = (
            normalizar_unidade(linha[colunas["unidade"]])
            if colunas["unidade"] is not None
            else "un"
        )
        session.add(
            Insumo(
                empresa_id=empresa.id,
                nome=nome,
                unidade_medida=unidade,
                categoria_id=categoria.id if categoria else None,
            )
        )
        existentes.add(nome.lower())
        resultado.criados += 1

    return resultado
