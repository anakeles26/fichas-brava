"""Impressão da ficha "Preparar receita" em impressora térmica ou A4.

O Streamlit não imprime um pedaço da tela, e o Ctrl+P do navegador sai com
menu, barra lateral e cores do app. Por isso a página embute (st.iframe) um
documento próprio: na tela só aparece o botão Imprimir (com o formato ao
lado); na impressão só aparece a ficha, formatada para o papel escolhido.
O navegador não informa qual impressora foi selecionada, por isso o formato
fica salvo no navegador de cada computador (localStorage).

- Térmica 80 mm (Tanca TP-650, Bematech MP-4200 TH, Elgin i9 e similares) e
  58 mm: texto preto, sem fundo, fonte maior e linha de corte. A altura da
  página é medida no navegador na hora de imprimir, para o cupom sair do
  tamanho do conteúdo (sem folha em branco nem corte no meio).
- A4 (Brother L8900 e qualquer jato/laser): margens de 15 mm e ingredientes
  em tabela.

Na janela de impressão, escolha a impressora; nas térmicas, deixe margens
"Nenhuma" e escala 100% (o tamanho do papel já vai definido pela página).
"""

from __future__ import annotations

from collections.abc import Iterator
from html import escape

from fichabase.datas import agora as agora_local
from fichabase.receitas import ItemComposicao, formatar_quantidade


def linhas_itens(
    itens: list[ItemComposicao], multiplicador: float, nivel: int = 0
) -> Iterator[tuple[int, str, str, str | None]]:
    """(nível, nome, quantidade formatada, aviso) já multiplicados, com as
    sub-receitas expandidas logo abaixo do item que as usa."""
    for it in itens:
        yield nivel, it["nome"], formatar_quantidade(it["quantidade"] * multiplicador, it["unidade"]), it["aviso"]
        if it["sub_itens"]:
            yield from linhas_itens(it["sub_itens"], multiplicador * it["fator_sub"], nivel + 1)


def _numero(valor: float) -> str:
    return f"{valor:g}".replace(".", ",")


def html_impressao(
    *,
    nome: str,
    empresa: str,
    multiplicador: float,
    rendimento_quantidade: float,
    rendimento_unidade: str,
    itens: list[ItemComposicao],
    passos: list[tuple[str, int | None]],
    alergenos: list[str],
    validades: list[tuple[str, str]],
    detalhes: list[tuple[str, str]] | None = None,
) -> str:
    """Documento com os botões de impressão e a ficha pronta para imprimir."""
    agora = agora_local().strftime("%d/%m/%Y %H:%M")
    rendimento = formatar_quantidade(rendimento_quantidade * multiplicador, rendimento_unidade)

    linhas = "".join(
        f'<tr class="nivel{min(nivel, 3)}"><td class="nome">{"↳ " if nivel else ""}{escape(item)}'
        + (f'<div class="aviso">{escape(aviso)}</div>' if aviso else "")
        + f'</td><td class="qtd">{escape(qtd)}</td></tr>'
        for nivel, item, qtd, aviso in linhas_itens(itens, multiplicador)
    ) or '<tr><td colspan="2">Nenhum ingrediente cadastrado.</td></tr>'

    preparo = "".join(
        f"<li>{escape(descricao)}{f' <b>({tempo} min)</b>' if tempo else ''}</li>" for descricao, tempo in passos
    )
    blocos = [
        '<div class="cab">',
        f"<h1>{escape(nome)}</h1>",
        f'<div class="meta">{escape(empresa)} · {agora}</div>',
        f'<div class="meta">Rendimento: <b>{escape(rendimento)}</b> · Multiplicador: <b>{_numero(multiplicador)}×</b></div>',
        "</div>",
    ]
    if alergenos:
        blocos.append(f'<div class="alerta">CONTÉM: {escape(", ".join(alergenos))}</div>')
    if detalhes:  # drinks do bar: louça, guarnição, gelo, modalidade
        linhas_detalhes = "".join(
            f'<tr><td class="nome">{escape(rotulo)}</td><td class="qtd">{escape(valor)}</td></tr>'
            for rotulo, valor in detalhes
        )
        blocos += ["<h2>Serviço</h2>", f"<table>{linhas_detalhes}</table>"]
    blocos += ["<h2>Ingredientes</h2>", f"<table>{linhas}</table>"]
    if preparo:
        blocos += ["<h2>Modo de preparo</h2>", f"<ol>{preparo}</ol>"]
    if validades:
        itens_validade = "".join(f"<li>{escape(rotulo)}: <b>{escape(dias)}</b></li>" for rotulo, dias in validades)
        blocos += ["<h2>Validade</h2>", f'<ul class="validade">{itens_validade}</ul>']
    blocos.append('<div class="rodape">FichaBase</div>')

    return f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style id="pagina"></style>
<style>
  body {{ margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }}
  .barra {{
    display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 2px;
    font: 14px "Source Sans Pro", Arial, sans-serif;
  }}
  .barra select {{
    font: inherit; color: #1A1A1A; padding: 7px 8px; border: 1px solid #D0D5DD; border-radius: 8px;
    background: #fff; cursor: pointer;
  }}
  .barra button {{
    display: inline-flex; align-items: center; gap: 6px; font: 600 14px "Source Sans Pro", Arial, sans-serif;
    padding: 8px 16px; cursor: pointer; border-radius: 8px; border: 1px solid #1B4332;
    background: #1B4332; color: #fff;
  }}
  .barra button:hover {{ background: #2D6A4F; border-color: #2D6A4F; }}
  .barra svg {{ width: 18px; height: 18px; fill: currentColor; }}
  #doc {{ display: none; }}
  @media print {{
    .barra {{ display: none; }}
    #doc {{ display: block; }}
    * {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  }}
  h1 {{ margin: 0 0 2px; line-height: 1.15; }}
  h2 {{ margin: 10px 0 4px; text-transform: uppercase; }}
  table {{ width: 100%; border-collapse: collapse; }}
  td {{ vertical-align: top; padding: 2px 0; }}
  td.qtd {{ text-align: right; font-weight: 700; white-space: nowrap; padding-left: 6px; }}
  tr.nivel1 td.nome {{ padding-left: 8px; }}
  tr.nivel2 td.nome {{ padding-left: 16px; }}
  tr.nivel3 td.nome {{ padding-left: 24px; }}
  .aviso {{ font-style: italic; font-size: .85em; }}
  .alerta {{ font-weight: 700; border: 1.5px solid #000; padding: 3px 5px; margin-top: 6px; }}
  ol, ul {{ margin: 0; padding-left: 1.3em; }}
  li {{ margin-bottom: 3px; }}
  .rodape {{ margin-top: 10px; text-align: center; font-size: .8em; }}

  /* Térmica: papel contínuo, tudo preto, sem fundo. Largura útil = bobina - margens do cabeçote. */
  body.t80 #doc {{ width: 72mm; padding: 2mm 4mm 8mm; font-size: 12px; }}
  body.t58 #doc {{ width: 48mm; padding: 2mm 5mm 8mm; font-size: 10.5px; }}
  body.t80 h1, body.t58 h1 {{ font-size: 1.35em; text-align: center; }}
  body.t80 h2, body.t58 h2 {{ font-size: 1em; border-top: 1px dashed #000; padding-top: 5px; }}
  body.t80 .cab, body.t58 .cab {{ text-align: center; }}
  body.t80 .meta, body.t58 .meta {{ font-size: .9em; }}
  body.t80 td, body.t58 td {{ border-bottom: 1px dotted #000; }}
  body.t80 .rodape, body.t58 .rodape {{ border-top: 1px dashed #000; padding-top: 5px; }}

  /* A4 (Brother L8900): tabela com linhas, título grande, cor só no cabeçalho. */
  body.a4 #doc {{ font-size: 11pt; }}
  body.a4 h1 {{ font-size: 20pt; color: #1E4D33; }}
  body.a4 .cab {{ border-bottom: 2px solid #1E4D33; padding-bottom: 6px; margin-bottom: 6px; }}
  body.a4 .meta {{ color: #333; }}
  body.a4 h2 {{ font-size: 11pt; color: #1E4D33; margin-top: 14px; }}
  body.a4 td {{ border-bottom: 1px solid #ccc; padding: 3px 2px; }}
  body.a4 tr, body.a4 li {{ page-break-inside: avoid; }}
  body.a4 h2 {{ page-break-after: avoid; }}
</style></head>
<body>
  <div class="barra">
    <select id="formato" title="Formato do papel — fica salvo neste computador">
      <option value="t80">Térmica 80 mm</option>
      <option value="t58">Térmica 58 mm</option>
      <option value="a4">A4</option>
    </select>
    <button onclick="imprimir(document.getElementById('formato').value)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
      Imprimir
    </button>
  </div>
  <div id="doc">{"".join(blocos)}</div>
<script>
  // O navegador não informa qual impressora foi escolhida na janela de impressão,
  // então o formato fica salvo por computador (cozinha = térmica, escritório = A4).
  const CHAVE_FORMATO = "fichabase_formato_impressao";
  const seletor = document.getElementById("formato");
  try {{
    const salvo = localStorage.getItem(CHAVE_FORMATO);
    if (salvo) seletor.value = salvo;
  }} catch (e) {{}}
  seletor.addEventListener("change", () => {{
    try {{ localStorage.setItem(CHAVE_FORMATO, seletor.value); }} catch (e) {{}}
  }});

  function imprimir(modo) {{
    document.body.className = modo;
    const pagina = document.getElementById("pagina");
    if (modo === "a4") {{
      pagina.textContent = "@page {{ size: A4; margin: 15mm; }}";
    }} else {{
      // Mede a ficha já na largura do papel para a página ter a altura exata do cupom.
      const doc = document.getElementById("doc");
      doc.style.display = "block";
      const alturaMm = Math.ceil(doc.getBoundingClientRect().height * 25.4 / 96) + 4;
      doc.style.display = "";
      const largura = modo === "t80" ? 80 : 58;
      pagina.textContent = `@page {{ size: ${{largura}}mm ${{alturaMm}}mm; margin: 0; }}`;
    }}
    window.print();
  }}
</script>
</body></html>"""
