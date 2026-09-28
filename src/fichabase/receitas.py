"""Cálculo de composição de ficha técnica, incluindo expansão de
sub-receitas — lógica pura (sem Streamlit, sem sessão do banco), pra poder
ser testada e reaproveitada fora da página `pages/fichas_tecnicas.py`.

`materializar_itens` precisa ser chamada com a sessão do banco ainda aberta
(acessa `item.sub_receita` via ORM); o resultado é só dados simples (dict),
então pode ser guardado e usado depois da sessão fechar — é assim que a
página evita o DetachedInstanceError do st.dialog (ver docstring lá).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, TypedDict

if TYPE_CHECKING:
    from fichabase.models import Receita

_FATORES_CONVERSAO = {("kg", "g"): 1000, ("g", "kg"): 0.001, ("l", "ml"): 1000, ("ml", "l"): 0.001}


class ItemComposicao(TypedDict):
    nome: str
    quantidade: float
    unidade: str
    sub_itens: list[ItemComposicao]
    fator_sub: float
    aviso: str | None


UNIDADES = ["g", "kg", "ml", "l", "un", "pc"]

# Unidades em que dá pra digitar/mostrar a quantidade de um item cuja unidade
# de cadastro é a chave (insumo em kg aceita g ou kg, etc.).
UNIDADES_COMPATIVEIS = {
    "kg": ["g", "kg"],
    "g": ["g", "kg"],
    "l": ["ml", "l"],
    "ml": ["ml", "l"],
    "un": ["un"],
    "pc": ["pc"],
}


def unidade_de_exibicao(quantidade: float, unidade: str) -> tuple[float, str]:
    """Escala pra unidade mais legível na cozinha: 0,1 kg -> 100 g,
    0,01 l -> 10 ml, 1500 g -> 1,5 kg. O banco continua guardando na unidade
    de cadastro — isso é só apresentação."""
    if unidade == "kg" and 0 < quantidade < 1:
        return quantidade * 1000, "g"
    if unidade == "l" and 0 < quantidade < 1:
        return quantidade * 1000, "ml"
    if unidade == "g" and quantidade >= 1000:
        return quantidade / 1000, "kg"
    if unidade == "ml" and quantidade >= 1000:
        return quantidade / 1000, "l"
    return quantidade, unidade


def formatar_numero(valor: float) -> str:
    # round tira o ruído de ponto flutuante (0,003 * 1000 = 3,0000000000000004).
    return f"{round(valor, 3):g}".replace(".", ",")


def formatar_quantidade(quantidade: float, unidade: str) -> str:
    """Texto pronto pra tela ("100 g", "1,5 l"). Quantidade 0 = ficha
    original sem quantidade (ex: raspa de limão) — aparece como "a gosto"."""
    if not quantidade:
        return "a gosto"
    valor, unidade_exib = unidade_de_exibicao(float(quantidade), unidade)
    return f"{formatar_numero(valor)} {unidade_exib}"


def converter_unidade(quantidade: float, de: str, para: str) -> float | None:
    """Converte entre unidades de mesma grandeza (kg<->g, l<->ml). None se
    não for possível converter (unidades incompatíveis, ex: 'un' vs 'kg')."""
    if de == para:
        return quantidade
    fator = _FATORES_CONVERSAO.get((de, para))
    return quantidade * fator if fator else None


def materializar_itens(receita: Receita, visitados: frozenset[int]) -> list[ItemComposicao]:
    """Achata a composição de uma ficha em dados simples, pra 1x da receita —
    o multiplicador é aplicado depois, em `renderizar_itens` (só aritmética).
    Expande sub-receitas recursivamente; corta se a sub-receita já apareceu
    no caminho atual (referência circular), mostrando a linha sem expandir,
    com aviso."""
    resultado: list[ItemComposicao] = []
    for item in receita.itens:
        entrada: ItemComposicao = {
            "nome": item.nome_item,
            "quantidade": float(item.quantidade),
            "unidade": item.unidade,
            "sub_itens": [],
            "fator_sub": 1.0,
            "aviso": None,
        }
        if item.sub_receita_id:
            sub = item.sub_receita
            if sub.id in visitados:
                entrada["aviso"] = "referência circular — não expandido"
            elif not sub.rendimento_quantidade:
                entrada["aviso"] = "sub-receita sem rendimento definido — não expandido"
            else:
                qtd_convertida = converter_unidade(entrada["quantidade"], item.unidade, sub.rendimento_unidade)
                if qtd_convertida is None:
                    entrada["aviso"] = "unidade incompatível com o rendimento da sub-receita — não expandido"
                else:
                    entrada["fator_sub"] = qtd_convertida / float(sub.rendimento_quantidade)
                    entrada["sub_itens"] = materializar_itens(sub, visitados | {receita.id})
        resultado.append(entrada)
    return resultado
