"""Importa as fichas técnicas da cozinha do Brava Wine a partir das planilhas
do chef (modelo "FICHA TÉCNICA OPERACIONAL", uma ficha por aba).

Uso:
    python scripts/importar_fichas_brava.py "<pasta com os .xlsx>" --autor <email>

O que faz:
- cria a empresa "Brava Wine" e as categorias de ficha, se ainda não existirem;
- padroniza o nome dos insumos (PARMESSAO / PARMESAO / PAREMESSAO viram um
  só "Parmesão") e cadastra os que faltam, em gramas (ovos em unidade);
- liga molho bechamel, pomodoro e roti como sub-receitas das fichas que os usam;
- marca alérgenos pelo que a ficha declara e pelos ingredientes (revisar!);
- pula fichas que já existem com o mesmo nome (pode rodar de novo sem duplicar).

Quantidade gravada = peso bruto (é o que fecha com o rendimento da ficha). O
peso líquido, quando diferente, vai na observação do ingrediente.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from fichabase.auditoria import registrar
from fichabase.db import create_all, get_session
from fichabase.importacao_fichas import (
    FichaPlanilha,
    ItemPlanilha,
    chave,
    dias_refrigeracao,
    frase,
    ler_planilha,
)
from fichabase.models import (
    CATEGORIA_FICHA,
    Alergeno,
    Categoria,
    Empresa,
    Insumo,
    PassoPreparo,
    Receita,
    ReceitaInsumo,
    Usuario,
)

EMPRESA = "Brava Wine"

MOLHOS = "Molhos e bases"
ENTRADAS = "Entradas"
PRINCIPAIS = "Pratos principais"
VEGETARIANOS = "Vegetarianos"
SOBREMESAS = "Sobremesas"
BASES_DOCES = "Bases de sobremesa"
CATEGORIAS = [MOLHOS, ENTRADAS, PRINCIPAIS, VEGETARIANOS, SOBREMESAS, BASES_DOCES]


@dataclass
class Destino:
    nome: str
    categoria: str
    cardapio: str
    descricao: str = ""  # texto do cardápio (Word), em caixa alta como veio


# (arquivo, aba) -> como a ficha entra no sistema. Aba fora daqui é ignorada
# com aviso — assim uma aba nova na planilha nunca entra com nome/categoria errados.
FICHAS: dict[tuple[str, str], Destino] = {
    # --- Molhos (sub-receitas) ---
    ("FC MOLHOS.xlsx", "BECHAMEL"): Destino("Molho bechamel", MOLHOS, "Molhos da casa"),
    ("FC MOLHOS.xlsx", "POMORODO"): Destino("Molho pomodoro", MOLHOS, "Molhos da casa"),
    ("FC MOLHOS.xlsx", "ROTI"): Destino("Molho roti", MOLHOS, "Molhos da casa"),
    ("FCT EXECUTIVO 2.xlsx", "MOLHO DE MARACUJA"): Destino("Molho de maracujá", MOLHOS, "Executivo semana 2"),
    # --- Cardápio Week ---
    ("FC TEC WEEK.xlsx", "CROQUETE DE OSSO BUCO"): Destino(
        "Croquete de ossobuco", ENTRADAS, "Cardápio Week",
        "CROQUETE DE OSSO BUCO COM BRIE AO RECHEIO CREMOSO E ENVOLTO DE CROSTA DOURADA ACOMPANHADO DE GELEIA DE PIMENTA"),
    ("FC TEC WEEK.xlsx", "BRUSQUETA DE COGUMELOS"): Destino(
        "Bruschetta de cogumelos trufados", ENTRADAS, "Cardápio Week",
        "BRUSQUETA DE COGUMELOS,TOMATE SECO E MASCARPONE SALTEADA EM MANTEIGA AROMATIZADA DE ERVAS FINAS COROADA COM FIOS DE AZEITE TRUFADO E MEL DO ENGENHO"),
    ("FC TEC WEEK.xlsx", "TARTARE DE ATUM COM CAMARAO"): Destino(
        "Tartare de atum com camarão crocante", ENTRADAS, "Cardápio Week",
        "TARTARE DE ATUM COM AVOCADO AO CREAM DE LIMAO SICILIANO E CAMAROES CROCANTE"),
    ("FC TEC WEEK.xlsx", "SIRIGADO EM CROSTA DE ERVAS"): Destino(
        "Sirigado em crosta de ervas", PRINCIPAIS, "Cardápio Week",
        "SIRIGADO 140G AO CROCANTE DE ERVAS FINAS ACOMPANHADO DE PURE DE BANANA E RISOTO DE BRIE"),
    ("FC TEC WEEK.xlsx", "CAMARAO BEURRE BLANC"): Destino(
        "Camarão beurre blanc", PRINCIPAIS, "Cardápio Week",
        "CAMARAO 130G AO MOLHO BEURRE BLANC E ERVAS TRUFADAS ACOMPANHA DE FETTUCCINE AO PESTO DE MANJERICAO"),
    ("FC TEC WEEK.xlsx", "FILE MIGNON AO POAVRE"): Destino(
        "Filé mignon ao poivre", PRINCIPAIS, "Cardápio Week",
        "FILE MIGNON 140G AO MOLHO POIVRE ACOMPANHADO DE RISOTO DE MANDIOQUINHA E CROCANTE DE PARMESAO COM CASTANHA"),
    ("FC TEC WEEK.xlsx", "RAVIOLE DE ESPINAFRE COM RICOTA"): Destino(
        "Ravióli de espinafre com ricota", VEGETARIANOS, "Cardápio Week",
        "RAVIOLE DE ESPINAFRE E RICOTA COM TOMATE SECO AO BECHAMEL E PESTO DE COENTRO"),
    ("FC TEC WEEK.xlsx", "TARTE FINE DE CUPUAÇU"): Destino(
        "Tarte fine de cupuaçu", SOBREMESAS, "Cardápio Week",
        "TARTE FINE DE CUPUAÇU COM FAROFA DOCE DE CASTANHA,MASSA AMANTEIGADA COM RECHEIO DE CREME DE CUPUAÇU E FIOS BRILHANTES DE AÇAI E SUSPIRO CITRICO"),
    ("FC TEC WEEK.xlsx", "PANACOTA DE CASTANHA COM AÇAI"): Destino(
        "Panna cotta de castanha com açaí", SOBREMESAS, "Cardápio Week",
        "PANA COTTA DE CREME DE CASTANHA COM REDUÇAO DE AÇAI SEDOSA AROMATIZADA AO CREME DE CUPUAÇU E HORTELÃ"),
    # --- Executivo semana 1 ---
    ("FCT EXECUTIVO 1.xlsx", "FILE MINGON COM RISOTO"): Destino(
        "Filé mignon com risoto de cogumelos", PRINCIPAIS, "Executivo semana 1",
        "FILE MIGNON SELADO NA MANTEIGA DA TERRA LEVEMENTE TEMPERADO COM SAL E PIMENTA DO REINO, ACOMPANHA RISOTO DE COGUMELOS (CEBOLA PICADA, ALHO, SHIITAKE, CHAMPIGNON, MOLHO ROTI, PARMESÃO, MANTEIGA) E BROTO."),
    ("FCT EXECUTIVO 1.xlsx", "MOQUECA DE SIRIGADO"): Destino(
        "Moqueca de sirigado", PRINCIPAIS, "Executivo semana 1",
        "REFOGADO DE CEBOLA,ALHO,PIMENTAO VERMELHO,REPOLHO,CENOURA,ABOBRINHA,DENDÊ,CÚRCUMA,LEITE DE COCO,FARINHA DE TRIGO FINALIZA COM COENTRO (ACOMPANHA ARROZ BRANCO E PIRÃO)"),
    ("FCT EXECUTIVO 1.xlsx", "ARROZ DE POLVO"): Destino(
        "Arroz de polvo mediterrâneo", PRINCIPAIS, "Executivo semana 1",
        "REFOGADO DE CEBOLA,ALHO,ABOBRINHA,PIMENTAO VERMELHO,SALSINHA,VINHO TINTO,MOLHO BECHAMEL,PARMESÃO,MANTEIGA (50G DE TENTÁCULOS PARA DECORAR,BROTO,REDUÇÃO DE VINHO TINTO COM AÇÚCAR)"),
    ("FCT EXECUTIVO 1.xlsx", "BERINGELA GRATINADA"): Destino(
        "Berinjela gratinada", VEGETARIANOS, "Executivo semana 1",
        "REFOGADO DE BERINJELA,CEBOLA,ALHO,CEBOLINHA,MOLHO POMODORO,MUÇARELA"),
    ("FCT EXECUTIVO 1.xlsx", "DELICIA ABACAXI BRAVA"): Destino("Delícia de abacaxi Brava", SOBREMESAS, "Executivo semana 1"),
    ("FCT EXECUTIVO 1.xlsx", "SORVETE COCO"): Destino("Sorvete de coco", BASES_DOCES, "Executivo semana 1"),
    ("FCT EXECUTIVO 1.xlsx", "FAROFA COCO"): Destino("Farofa de biscoito e coco", BASES_DOCES, "Executivo semana 1"),
    ("FCT EXECUTIVO 1.xlsx", "CARAMELO"): Destino("Caramelo", BASES_DOCES, "Executivo semana 1"),
    ("FCT EXECUTIVO 1.xlsx", "ABACAXI"): Destino("Abacaxi caramelizado", BASES_DOCES, "Executivo semana 1"),
    ("FCT EXECUTIVO 1.xlsx", "CARNE DE SOL COM MACAXEIRA"): Destino("Carne de sol com macaxeira", PRINCIPAIS, "Executivo semana 1"),
    ("FCT EXECUTIVO 1.xlsx", "RONDELE DE RICOTA"): Destino("Rondele de ricota com espinafre", VEGETARIANOS, "Executivo semana 1"),
    ("FCT EXECUTIVO 1.xlsx", "BAVETE ALFREDO"): Destino("Bavete ao molho alfredo com camarões", PRINCIPAIS, "Executivo semana 1"),
    ("FCT EXECUTIVO 1.xlsx", "TORTA DE CHOCOLATE"): Destino("Torta de chocolate", SOBREMESAS, "Executivo semana 1"),
    # --- Executivo semana 2 ---
    ("FCT EXECUTIVO 2.xlsx", "SALMAO AO MOLHO DE MARACUJA"): Destino(
        "Salmão ao molho de maracujá com risoto siciliano", PRINCIPAIS, "Executivo semana 2",
        "SALMAO 120G EM TIRAS AO MOLHO DE MARACUJA COM RISOTO DE LIMAO SICILIANO CHIPS DE BATATA E BROTOS"),
    ("FCT EXECUTIVO 2.xlsx", "CARNE DE SOL "): Destino(
        "Carne de sol nordestina", PRINCIPAIS, "Executivo semana 2",
        "CARNE DE SOL 160G NA PARRILHA REGADA NA MANTEIGA DA TERRA COM CEBOLA ROXA,QUEIJO COALHO GRATINADO E PURE DE MACAXEIRA COM ARROZ CARRETEIRO"),
    ("FCT EXECUTIVO 2.xlsx", "FRANGO A PARMEGIANA"): Destino(
        "Frango à parmegiana", PRINCIPAIS, "Executivo semana 2",
        "FRANGO 150G A PARMEGIANA COM BAVETE AO MOLHO POMODORO,PARMESAO E MANJERICAO"),
    ("FCT EXECUTIVO 2.xlsx", "RIGATONI"): Destino(
        "Rigatoni ao pomodoro", VEGETARIANOS, "Executivo semana 2",
        "RIGATONI 200G AO MOLHO POMODORO COM ESCABECHE DE ABOBRINHA E BERINJELA E GOTAS DE CREAM CHEESE COM MANJERICAO."),
    ("FCT EXECUTIVO 2.xlsx", "PAVE CREMOSO"): Destino(
        "Pavê cremoso", SOBREMESAS, "Executivo semana 2",
        "PAVE CREMOSO,FAROFA DE CASTANHA COM FIOS DE CHOCOLATE BRANCO E UMA FOLHA DE HORTELÃ"),
    # --- Executivo semana 4 ---
    ("FCT EXECUTIVO 4.xlsx", "BAVETE AO MOLHO COM SALMAO"): Destino("Bavete ao molho de queijo com salmão", PRINCIPAIS, "Executivo semana 4"),
    ("FCT EXECUTIVO 4.xlsx", "FILE TORNEDOR AO POAVRE "): Destino("Filé tornedor ao molho poivre", PRINCIPAIS, "Executivo semana 4"),
    ("FCT EXECUTIVO 4.xlsx", "RISOTO DE TOMATE SECO E POLVO"): Destino("Risoto de tomate seco e polvo", PRINCIPAIS, "Executivo semana 4"),
    ("FCT EXECUTIVO 4.xlsx", "NHOQUIE DE BANANA "): Destino("Nhoque de banana-da-terra", VEGETARIANOS, "Executivo semana 4"),
    ("FCT EXECUTIVO 4.xlsx", "BROWNIE"): Destino("Brownie com doce de leite e crocante de castanha", SOBREMESAS, "Executivo semana 4"),
    # --- Executivo semana 6 ---
    ("FCT EXECUTIVO 6.xlsx", "STROGONOFF DE FILE"): Destino(
        "Strogonoff de filé", PRINCIPAIS, "Executivo semana 6",
        "STROGONOFF DE FILE ACOMPANHADO DE ARROZ BRANCO E BATATA RUSTICA"),
    ("FCT EXECUTIVO 6.xlsx", "SALMAO "): Destino(
        "Salmão belle provenci", PRINCIPAIS, "Executivo semana 6",
        "SALMAO BELLE PROVENCI ACOMPANHADO DE RISOTO DE MANDIOQUINHA E ALIGOT DE BATATA"),
    ("FCT EXECUTIVO 6.xlsx", "CAMARAO"): Destino(
        "Camarão à beurre blanc com fettuccine", PRINCIPAIS, "Executivo semana 6",
        "CAMARAO A BEURRE BLANC ACOMPANHADO DE FETTUCCINE E MOLHO CONTEMPORANEO A BASE DE VINHO BRANCO SECO MANTEIGA E ERVAS"),
    ("FCT EXECUTIVO 6.xlsx", "RAVIOLE"): Destino(
        "Ravióli medit secch", VEGETARIANOS, "Executivo semana 6",
        "RAVIOLE MEDIT SECCH COM RICOTA,ESPINAFRE E TOMATE SECO AO BECHAMEL E MANJERICAO COM PESTO DE COENTRO"),
    ("FCT EXECUTIVO 6.xlsx", "COCADA DE FORNO"): Destino(
        "Cocada de forno", SOBREMESAS, "Executivo semana 6",
        "COCADA DE FORNO COM SORVETE DE TAPIOCA E FIOS DE CARAMELO"),
    # --- Executivo semana 7 ---
    ("FCT EXECUTIVO 7.xlsx", "CHORIZO"): Destino(
        "Chorizo ao bordelaise", PRINCIPAIS, "Executivo semana 7",
        "CHORIZO AO DEMIGLACE COM RISOTO DE AÇAFRAO E CHIPS DE MACAXEIRA"),
    ("FCT EXECUTIVO 7.xlsx", "CAMARAO MEDIT ROSSO"): Destino(
        "Camarão medit rosso del mare", PRINCIPAIS, "Executivo semana 7",
        "CAMARAO MEDIT ROSSO DEL MARE COM RISOTO DE TOMATE SECO E RUCULA SELVAGEM"),
    ("FCT EXECUTIVO 7.xlsx", "SIRIGADO A BELLE RIVIERA"): Destino(
        "Sirigado à belle riviera", PRINCIPAIS, "Executivo semana 7",
        "SIRIGADO A BELLE RIVIERA COM VAGEM AO MOLHO DIJONNAISE E MEL COM RISOTO DE ALHO PORO"),
    ("FCT EXECUTIVO 7.xlsx", "RONDELE QUATTRO FORMAGGI"): Destino(
        "Rondele quattro formaggi", VEGETARIANOS, "Executivo semana 7",
        "RONDELE DE RICOTA COM BROCOLIS,TOMATE SECO E FONDUTA QUATTRO FORMAGGI"),
    ("FCT EXECUTIVO 7.xlsx", "SPHÈRE DE CHOCOLATE"): Destino(
        "Sphère de chocolate", SOBREMESAS, "Executivo semana 7",
        "SPHÈRE DE CHOCOLATE COM MOUSSE BRANCO E CRUMBLE"),
}

# Nome como veio na planilha (ver `chave`) -> nome padronizado do insumo.
# Grafias diferentes do mesmo produto viram um insumo só; o que não está aqui
# entra com o nome da planilha em formato de frase.
INSUMOS = {
    "ABACATI": "Abacate", "ACUCAR": "Açúcar", "AGUA": "Água",
    "AGUA COM LEGUMES": "Água com legumes (consommé)", "AGUA COM LEGUMES(CONSUME)": "Água com legumes (consommé)",
    "ALCAPARRAS": "Alcaparras", "ALECRIM": "Alecrim fresco", "ALECRIM FRESCO": "Alecrim fresco",
    "ALHO INTEIRO": "Alho", "ALHO PORO": "Alho-poró", "ARROZ": "Arroz branco", "ARROZ ARBOREO": "Arroz arbóreo",
    "AZEITE EXTRA VIRGEM": "Azeite extra virgem", "ACAFRAO": "Açafrão", "ACAI": "Açaí",
    "BANANA DA TERRA": "Banana-da-terra", "BATATA": "Batata inglesa", "BATATA RUSTICA": "Batata rústica",
    "BISCOITO MAISENA": "Biscoito maisena", "BROCOLES": "Brócolis", "BROTO": "Brotos", "BROTOS": "Brotos",
    "CACHACA": "Cachaça branca", "CAFE": "Café", "CAMARAO": "Camarão", "CANELA DE BOI": "Canela de boi (osso)",
    "CANELA EM PO": "Canela em pó", "CHAMPGNON": "Champignon", "CHAMPINGNON": "Champignon",
    "CHANTILY": "Chantilly", "COGUMELO PARIS": "Cogumelo paris",
    "CREAME CHEASE": "Cream cheese", "CREAME CHEEASE": "Cream cheese",
    "CREME CULINARIO": "Creme de leite culinário", "CREME DE LEITE CULINARIO": "Creme de leite culinário",
    "CRISPE DE COUVE MANTEIGA": "Couve-manteiga (crispy)", "CUPUACU": "Cupuaçu", "DENDE": "Azeite de dendê",
    "EMUCIFICANTE": "Emulsificante", "EXENCIA DE BAUNILHA": "Essência de baunilha",
    "FARINHA DE PANKO": "Farinha panko", "PANKO": "Farinha panko",
    "FILE MIGON EM TIRAS": "Filé mignon", "FILE MINGNON": "Filé mignon", "FIOLHAS DE LOURO": "Louro (folhas)",
    "LOURO": "Louro (folhas)", "GELEI DE PIMENTA": "Geleia de pimenta", "HORTELA": "Hortelã",
    "KATCHUP": "Ketchup", "LEITE": "Leite integral", "LIMAO SICILIANO": "Limão siciliano",
    "MANDIOQUINHA": "Mandioquinha", "MANJERICAO": "Manjericão fresco", "MANJERICAO FRESCO": "Manjericão fresco",
    "MANTEIGA SEM SAL GELADA": "Manteiga sem sal", "MARACUJA": "Maracujá", "MASCAPONE": "Mascarpone",
    "MASSA PASTEL": "Massa de pastel", "MELACO DE CANA": "Melaço de cana", "MOLHO INGLES": "Molho inglês",
    "MOLHO SHOYU": "Shoyu", "SHOYO": "Shoyu", "MOSTARDA DJON": "Mostarda Dijon",
    "MUSARELA": "Muçarela", "MUSSARELA": "Muçarela", "OLHEO": "Óleo", "OSSO BUCO": "Ossobuco",
    "OVO(GEMA)": "Ovos", "OVOS": "Ovos", "PAO ITALIANO": "Pão italiano",
    "PAREMESSAO": "Parmesão", "PARMESAO": "Parmesão", "PARMESSAO": "Parmesão",
    "PIMENTA POAVRE": "Pimenta preta em grãos (poivre)", "PIMENTA DO REINO EM GRAOS": "Pimenta-do-reino em grãos",
    "PIMENTA DO REINO": "Pimenta-do-reino", "PIMENTAO VERMELHO": "Pimentão vermelho", "PURE DE BATATA": "Purê de batata",
    "REQUEIJAO": "Requeijão", "RUCULA SELVAGEM": "Rúcula selvagem", "SAL": "Sal fino", "SAL FINO": "Sal fino",
    "SALMAO": "Salmão", "SALSAO": "Salsão", "SASINHA": "Salsinha", "SHITAKI": "Shiitake",
    "SORVETE": "Sorvete de creme", "SUMO LIMAO": "Suco de limão", "VARGEM": "Vagem",
    "VINAGRE BANCO SECO": "Vinagre de vinho branco", "VINAGRE DE VINHO BRANCO": "Vinagre de vinho branco",
    "VINHO BRANCO": "Vinho branco seco", "VINHO BRANCO SECO": "Vinho branco seco",
    "VINHO TINTO": "Vinho tinto seco", "VINHO TINTO SECO": "Vinho tinto seco",
    "APARA DE FILE": "Aparas de filé", "BERINGELA": "Berinjela", "CHOCOLATE EM PO": "Chocolate em pó",
    "PESTO DE MANJERICAO": "Pesto de manjericão", "NOZ MOSCADA": "Noz-moscada", "CEBOLA": "Cebola branca", "COGUMELOS": "Cogumelos",
}

# Ingredientes que são outra ficha (sub-receita): nome da planilha -> ficha.
SUB_RECEITAS = {
    "MOLHO BECHAMEL": "Molho bechamel", "BECHAMEL": "Molho bechamel", "MOLHO BRANCO": "Molho bechamel",
    "MOLHO POMODORO": "Molho pomodoro", "MOLHO POMORORO": "Molho pomodoro", "MOLHO POLMODORO": "Molho pomodoro",
    "POLMODORO": "Molho pomodoro", "POMODORO": "Molho pomodoro",
    "MOLHO ROTI": "Molho roti",
}

# Insumos contados em unidade (o resto das fichas está em gramas).
EM_UNIDADE = {"Ovos"}

# Rendimento que a planilha não dá em gramas.
RENDIMENTO_MANUAL = {
    "Molho roti": 5500.0,  # "5 A 6 LT" -> 5,5 l ~ 5.500 g
    "Arroz de polvo mediterrâneo": 418.0,  # planilha diz 309; confirmado 418 (soma dos ingredientes)
}

# Alérgenos declarados em "Outras orientações".
ALERGENOS_DECLARADOS = {"GLUTEM": ["Glúten"], "GLUTEN": ["Glúten"], "LACTOSE": ["Lactose"], "MARISCOS": ["Crustáceos"]}

# Alérgenos deduzidos dos ingredientes: trecho do nome (sem acento) -> alérgenos.
ALERGENOS_POR_INSUMO = {
    "FARINHA DE TRIGO": ["Glúten"], "PANKO": ["Glúten"], "PAO ": ["Glúten"], "BISCOITO": ["Glúten"],
    "MASSA DE PASTEL": ["Glúten"], "BAVETE": ["Glúten"], "RIGATONI": ["Glúten"], "FETTUCCINE": ["Glúten"],
    "SHOYU": ["Glúten", "Soja"],
    "LEITE": ["Leite", "Lactose"], "MANTEIGA": ["Leite", "Lactose"], "QUEIJO": ["Leite", "Lactose"],
    "PARMESAO": ["Leite", "Lactose"], "MUCARELA": ["Leite", "Lactose"], "RICOTA": ["Leite", "Lactose"],
    "BRIE": ["Leite", "Lactose"], "GORGONZOLA": ["Leite", "Lactose"], "CATUPIRY": ["Leite", "Lactose"],
    "REQUEIJAO": ["Leite", "Lactose"], "CREAM CHEESE": ["Leite", "Lactose"], "MASCARPONE": ["Leite", "Lactose"],
    "CHANTILLY": ["Leite", "Lactose"], "SORVETE": ["Leite", "Lactose"], "CHOCOLATE BRANCO": ["Leite", "Lactose"],
    "OVOS": ["Ovo"],
    "SIRIGADO": ["Peixe"], "SALMAO": ["Peixe"], "ATUM": ["Peixe"],
    "CAMARAO": ["Crustáceos"],
    "CASTANHA": ["Castanha"],
}
# Falsos positivos da busca por trecho: "leite de coco" não é leite, "couve-manteiga" não é manteiga.
EXCECOES_ALERGENO = {"LEITE": "COCO", "MANTEIGA": "COUVE"}


def nome_insumo(bruto: str) -> str:
    return INSUMOS.get(chave(bruto)) or frase(bruto)


def montar_observacoes(ficha: FichaPlanilha, destino: Destino) -> str:
    linhas = [f"**Cardápio:** {destino.cardapio}"]
    if destino.descricao:
        linhas.append(f"**Descrição:** {frase(destino.descricao)}")
    if ficha.porcoes or ficha.porcao_g:
        linhas.append(f"**Porções:** {ficha.porcoes or '—'} · **Porção:** {ficha.porcao_g or '—'} g")
    if destino.nome in RENDIMENTO_MANUAL:
        linhas.append(f"**Rendimento na ficha original:** {ficha.rendimento_texto}")
    if ficha.equipamentos:
        linhas.append(f"**Equipamentos:** {frase(ficha.equipamentos)}")
    if ficha.tempo_coccao:
        linhas.append(f"**Tempo de cocção:** {frase(ficha.tempo_coccao)}")
    if ficha.orientacoes and chave(ficha.orientacoes) != "ALERGENICOS":
        orientacoes = frase(ficha.orientacoes).replace("lutem", "lúten").replace("graos", "grãos")
        linhas.append(f"**Orientações:** {orientacoes}")
    if ficha.refrigeracao:
        linhas.append(f"**Refrigeração:** {frase(ficha.refrigeracao)}")
    linhas += [f"**Atenção:** {aviso}" for aviso in ficha.avisos_preparo]
    linhas.append(f"_Importada de {ficha.arquivo} (aba {ficha.aba.strip()})._")
    return "  \n".join(linhas)


def alergenos_da_ficha(ficha: FichaPlanilha, nomes_itens: list[str], de_sub_receitas: set[str]) -> set[str]:
    achados = set(de_sub_receitas)
    for parte in chave(ficha.orientacoes).replace("/", ",").replace(" E ", ",").split(","):
        achados.update(ALERGENOS_DECLARADOS.get(parte.strip(), []))
    for nome in nomes_itens:
        n = chave(nome) + " "
        for trecho, alergenos in ALERGENOS_POR_INSUMO.items():
            excecao = EXCECOES_ALERGENO.get(trecho)
            if trecho in n and not (excecao and excecao in n and "DOCE" not in n):
                achados.update(alergenos)
    return achados


def importar(pasta: Path, email_autor: str) -> None:
    create_all()
    fichas: list[tuple[FichaPlanilha, Destino]] = []
    for arquivo in sorted(pasta.glob("*.xlsx")):
        for ficha in ler_planilha(arquivo):
            destino = FICHAS.get((arquivo.name, ficha.aba))
            if destino is None:
                print(f"  ! aba sem de-para, ignorada: {arquivo.name} / {ficha.aba}")
                continue
            fichas.append((ficha, destino))

    # Molhos primeiro: precisam existir para entrar como sub-receita nas demais.
    fichas.sort(key=lambda par: par[1].categoria != MOLHOS)

    with get_session() as session:
        autor = session.query(Usuario).filter_by(email=email_autor).one()
        empresa = session.query(Empresa).filter_by(nome=EMPRESA).one_or_none()
        if empresa is None:
            empresa = Empresa(nome=EMPRESA, slug="brava-wine")
            session.add(empresa)
            session.flush()

        categorias = {c.nome: c for c in session.query(Categoria).filter_by(empresa_id=empresa.id, tipo=CATEGORIA_FICHA)}
        for nome in CATEGORIAS:
            if nome not in categorias:
                categorias[nome] = Categoria(empresa_id=empresa.id, tipo=CATEGORIA_FICHA, nome=nome)
                session.add(categorias[nome])
        insumos = {i.nome: i for i in session.query(Insumo).filter_by(empresa_id=empresa.id)}
        receitas = {r.nome: r for r in session.query(Receita).filter_by(empresa_id=empresa.id)}
        alergenos = {a.nome: a for a in session.query(Alergeno)}
        alergenos_receita: dict[str, set[str]] = {r.nome: {a.nome for a in r.alergenos} for r in receitas.values()}

        criadas, puladas, vazias = [], [], []
        for ficha, destino in fichas:
            if destino.nome in receitas:
                puladas.append(destino.nome)
                continue
            if ficha.vazia:
                vazias.append(f"{destino.nome} ({ficha.arquivo})")
                continue

            receita = Receita(
                empresa_id=empresa.id,
                nome=destino.nome,
                categoria=categorias[destino.categoria],
                rendimento_quantidade=RENDIMENTO_MANUAL.get(destino.nome) or ficha.rendimento_g or 1,
                rendimento_unidade="g",
                observacoes=montar_observacoes(ficha, destino),
                validade_refrigerado_dias=dias_refrigeracao(ficha.refrigeracao),
            )
            nomes_itens, de_subs = [], set()
            for item in ficha.itens:
                receita.itens.append(_linha(session, empresa, item, insumos, receitas, nomes_itens, de_subs, alergenos_receita))
            receita.passos = [PassoPreparo(ordem=i, descricao=p) for i, p in enumerate(ficha.passos)]
            achados = alergenos_da_ficha(ficha, nomes_itens, de_subs)
            receita.alergenos = [alergenos[n] for n in sorted(achados) if n in alergenos]
            alergenos_receita[destino.nome] = achados
            session.add(receita)
            session.flush()
            receitas[destino.nome] = receita
            registrar(session, autor, empresa, "criar", "Receita", f"Importou a ficha '{destino.nome}' de {ficha.arquivo}")
            criadas.append(destino.nome)

    print(f"\n{len(criadas)} ficha(s) criada(s), {len(puladas)} já existiam, {len(vazias)} sem gramagem (não importadas).")
    for nome in vazias:
        print(f"  - sem gramagem: {nome}")


def _linha(session, empresa, item: ItemPlanilha, insumos, receitas, nomes_itens, de_subs, alergenos_receita) -> ReceitaInsumo:
    bruto = item.peso_bruto or 0
    obs = None
    if item.peso_liquido is not None and item.peso_liquido != item.peso_bruto:
        obs = f"Peso líquido: {item.peso_liquido:g} g"

    sub_nome = SUB_RECEITAS.get(chave(item.nome))
    if sub_nome and sub_nome in receitas:
        de_subs.update(alergenos_receita.get(sub_nome, set()))
        return ReceitaInsumo(sub_receita=receitas[sub_nome], quantidade=bruto, unidade_sub_receita="g", observacao=obs)

    nome = nome_insumo(item.nome)
    nomes_itens.append(nome)
    insumo = insumos.get(nome)
    if insumo is None:
        insumo = Insumo(empresa_id=empresa.id, nome=nome, unidade_medida="un" if nome in EM_UNIDADE else "g")
        session.add(insumo)
        insumos[nome] = insumo
    return ReceitaInsumo(insumo=insumo, quantidade=bruto, observacao=obs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("pasta", type=Path)
    parser.add_argument("--autor", required=True, help="e-mail do usuário que fica como autor no log de auditoria")
    args = parser.parse_args()
    if not args.pasta.is_dir():
        sys.exit(f"Pasta não encontrada: {args.pasta}")
    importar(args.pasta, args.autor)
