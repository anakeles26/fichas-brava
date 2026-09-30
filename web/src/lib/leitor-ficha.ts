// Leitura das planilhas do chef no modelo "FICHA TÉCNICA OPERACIONAL" (uma ficha por aba) —
// porte fiel de src/fichabase/importacao_fichas.py, para a importação pelo app dar o mesmo
// resultado da importação feita pelo script. Funções puras: recebem as linhas já lidas.
//
//   E4  Produto:<nome>            A9  Ingredientes | E9 Peso Bruto | G9 Peso Líquido
//   E5  Rendimento:<g>            A10.. um ingrediente por linha, até TOTAL
//   E6  Número de porções:<n>     MODO DE PREPARO  (texto quebrado em várias linhas)
//   E7  Porção em gramas:<g>      OBSERVAÇÕES      (Equipamentos, Tempo de cocção,
//                                                    Outras orientações, Refrigeração)
// As posições variam de aba para aba, então a leitura procura pelos rótulos.

export type ItemPlanilha = { nome: string; pesoBruto: number | null; pesoLiquido: number | null };

export type FichaPlanilha = {
  aba: string;
  produto: string;
  rendimentoG: number | null;
  rendimentoTexto: string;
  porcoes: string;
  porcaoG: string;
  itens: ItemPlanilha[];
  passos: string[];
  avisosPreparo: string[]; // linhas "OBS:" dentro do modo de preparo
  equipamentos: string;
  tempoCoccao: string;
  orientacoes: string;
  refrigeracao: string;
};

const COL_A = 0;
const COL_E = 4; // peso bruto
const COL_G = 6; // peso líquido

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Forma comparável de um nome: sem acento, maiúsculo e espaços simples. */
export function chave(texto: string): string {
  return semAcento(texto).toUpperCase().split(/\s+/).filter(Boolean).join(" ");
}

/** "REFOGAR O ALHO,A CEBOLA" → "Refogar o alho, a cebola" (espaços depois de vírgula, dois-pontos e barra). */
export function frase(texto: string): string {
  let t = texto.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
  t = t.replace(/\s*,\s*/g, ", ");
  t = t.replace(/(?<=[a-zà-ú)])\s*:\s*(?=\S)/g, ": ");
  t = t.replace(/(?<=[a-zà-ú])\s*\/\s*(?=[a-zà-ú])/g, " / ");
  t = t.replace(/(\d)\s*°\s*c\b/g, "$1°C");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** "425" → 425; "3.606" (milhar com ponto) → 3606; "0,5" → 0.5; texto → null. */
export function numeroBr(texto: string): number | null {
  const t = texto.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function textoCelula(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function numeroCelula(valor: unknown): number | null {
  if (typeof valor === "number") return valor;
  if (typeof valor === "string" && valor.trim()) return numeroBr(valor);
  return null;
}

/** "Produto:MOLHO BECHAMEL" com rótulo "Produto" → "MOLHO BECHAMEL"; outro texto → null. */
function valorRotulado(celula: unknown, rotulo: string): string | null {
  if (typeof celula !== "string" || !chave(celula).startsWith(chave(rotulo))) return null;
  const i = celula.indexOf(":");
  return i >= 0 ? celula.slice(i + 1).trim() : "";
}

/**
 * Junta as linhas do modo de preparo (quebradas no meio da frase pela largura da célula) e
 * reparte por frase e por rótulo de etapa ("FORMAR O ROUX:"). "1 -" no começo da linha é
 * numeração (por linha, não por passo) e sai; "40-50 MIN" não é numeração.
 */
export function passosDoPreparo(linhas: string[]): { passos: string[]; avisos: string[] } {
  const avisos: string[] = [];
  const corpo: string[] = [];
  for (const bruta of linhas) {
    const linha = bruta.replace(/^\s*\d+\s*-\s*(?!\d)/, "").trim();
    if (!linha) continue;
    if (chave(linha).startsWith("OBS")) {
      const i = linha.indexOf(":");
      avisos.push(frase(i >= 0 ? linha.slice(i + 1) : linha));
    } else {
      corpo.push(linha);
    }
  }
  let texto = corpo.join(" ");
  texto = texto.replace(/\.\s*(?=[A-ZÀ-Ú])/g, ".\n");
  texto = texto.replace(/\s+((?:[A-ZÀ-Ú]+ ){0,2}[A-ZÀ-Ú]{4,}:)/g, "\n$1");
  const passos = texto
    .split("\n")
    .filter((p) => p.replace(/^[ .]+|[ .]+$/g, "") !== "")
    .map(frase);
  return { passos, avisos };
}

export class AbaForaDoModelo extends Error {}

/** Uma aba (linhas com as colunas a partir de A, como lidas do Excel) → ficha. */
export function lerAba(linhas: unknown[][], aba: string): FichaPlanilha {
  const colA = (r: number) => textoCelula(linhas[r]?.[COL_A]);

  const cab: Record<string, string> = {};
  for (const linha of linhas) {
    for (const celula of linha) {
      for (const rotulo of ["Produto", "Rendimento", "Número de porções", "Porção em gramas"]) {
        const achado = valorRotulado(celula, rotulo);
        if (achado !== null) cab[rotulo] = achado;
      }
    }
  }

  const ultima = linhas.length;
  const inicio = linhas.findIndex((_, r) => chave(colA(r)).startsWith("INGREDIENTES"));
  if (inicio < 0) throw new AbaForaDoModelo(`A aba "${aba}" não está no modelo (sem a linha "Ingredientes").`);
  let preparo = -1;
  for (let r = inicio; r < ultima && preparo < 0; r++) if (chave(colA(r)) === "MODO DE PREPARO") preparo = r;
  if (preparo < 0) throw new AbaForaDoModelo(`A aba "${aba}" não está no modelo (sem "Modo de preparo").`);
  let observacoes = ultima;
  for (let r = preparo; r < ultima && observacoes === ultima; r++) if (chave(colA(r)) === "OBSERVACOES") observacoes = r;

  const itens: ItemPlanilha[] = [];
  for (let r = inicio + 1; r < preparo; r++) {
    const nome = colA(r);
    if (!nome || chave(nome) === "TOTAL") continue;
    itens.push({
      nome: nome.split(/\s+/).join(" "),
      pesoBruto: numeroCelula(linhas[r]?.[COL_E]),
      pesoLiquido: numeroCelula(linhas[r]?.[COL_G]),
    });
  }

  const { passos, avisos } = passosDoPreparo(Array.from({ length: observacoes - preparo - 1 }, (_, i) => colA(preparo + 1 + i)));

  const extras = { equipamentos: "", tempoCoccao: "", orientacoes: "", refrigeracao: "" };
  const rotulos: [string, keyof typeof extras][] = [
    ["EQUIPAMENTOS", "equipamentos"],
    ["TEMPO DE COCCAO", "tempoCoccao"],
    ["OUTRAS ORIENTACOES", "orientacoes"],
    ["REFRIGERACAO", "refrigeracao"],
  ];
  for (let r = observacoes + 1; r < ultima; r++) {
    const linha = colA(r);
    for (const [prefixo, campo] of rotulos) {
      if (chave(linha).startsWith(prefixo)) {
        const i = linha.indexOf(":");
        extras[campo] = i >= 0 ? linha.slice(i + 1).trim() : "";
      }
    }
  }

  const rendimentoTexto = cab["Rendimento"] ?? "";
  return {
    aba,
    produto: (cab["Produto"] ?? aba).trim(),
    rendimentoG: rendimentoTexto ? numeroBr(rendimentoTexto) : null,
    rendimentoTexto,
    porcoes: cab["Número de porções"] ?? "",
    porcaoG: cab["Porção em gramas"] ?? "",
    itens,
    passos,
    avisosPreparo: avisos,
    ...extras,
  };
}

/**
 * Rendimento escrito com unidade ("5 A 6 LT", "2,5 KG", "3 L") → gramas, usando a média de
 * uma faixa e 1 l ≈ 1 kg. É como a primeira importação tratou o molho roti ("5 A 6 LT" →
 * 5.500 g). null se não der para interpretar.
 */
export function rendimentoEstimadoG(texto: string): number | null {
  const m = chave(texto).match(/^(\d+(?:[.,]\d+)?)(?:\s*(?:A|-)\s*(\d+(?:[.,]\d+)?))?\s*(LT|LTS|L|LITROS?|KG|KGS|QUILOS?)\.?$/);
  if (!m) return null;
  const minimo = Number(m[1].replace(",", "."));
  const maximo = m[2] ? Number(m[2].replace(",", ".")) : minimo;
  return ((minimo + maximo) / 2) * 1000;
}

/** Aba ainda não preenchida: nenhum ingrediente com peso. */
export function fichaVazia(ficha: FichaPlanilha): boolean {
  return !ficha.itens.some((i) => i.pesoBruto);
}

/** "48H 2 - 4°C" → 2; "5 DIAS" → 5; sem número → null. */
export function diasRefrigeracao(texto: string): number | null {
  const t = chave(texto);
  const horas = t.match(/(\d+)\s*H\b/);
  if (horas) return Math.max(1, Math.floor(Number(horas[1]) / 24));
  const dias = t.match(/(\d+)\s*DIAS?\b/);
  return dias ? Number(dias[1]) : null;
}

/** Alérgenos declarados em "Outras orientações" ("GLUTEM,LACTOSE E GRAOS"). */
export function alergenosDeclarados(orientacoes: string): string[] {
  const mapa: Record<string, string> = { GLUTEM: "Glúten", GLUTEN: "Glúten", LACTOSE: "Lactose", MARISCOS: "Crustáceos" };
  const partes = chave(orientacoes).replace(/\//g, ",").replace(/ E /g, ",").split(",");
  return [...new Set(partes.map((p) => mapa[p.trim()]).filter((a): a is string => !!a))];
}

/** Observações no mesmo formato das fichas importadas pelo script (opcional na importação). */
export function montarObservacoes(ficha: FichaPlanilha, cardapio: string): string | null {
  const linhas: string[] = [];
  if (cardapio.trim()) linhas.push(`**Cardápio:** ${cardapio.trim()}`);
  if (ficha.porcoes || ficha.porcaoG) linhas.push(`**Porções:** ${ficha.porcoes || "—"} · **Porção:** ${ficha.porcaoG || "—"} g`);
  if (ficha.rendimentoG === null && ficha.rendimentoTexto) linhas.push(`**Rendimento na ficha original:** ${ficha.rendimentoTexto}`);
  if (ficha.equipamentos) linhas.push(`**Equipamentos:** ${frase(ficha.equipamentos)}`);
  if (ficha.tempoCoccao) linhas.push(`**Tempo de cocção:** ${frase(ficha.tempoCoccao)}`);
  if (ficha.orientacoes && chave(ficha.orientacoes) !== "ALERGENICOS") {
    linhas.push(`**Orientações:** ${frase(ficha.orientacoes).replace("lutem", "lúten").replace("graos", "grãos")}`);
  }
  if (ficha.refrigeracao) linhas.push(`**Refrigeração:** ${frase(ficha.refrigeracao)}`);
  for (const aviso of ficha.avisosPreparo) linhas.push(`**Atenção:** ${aviso}`);
  return linhas.length ? linhas.join("  \n") : null;
}
