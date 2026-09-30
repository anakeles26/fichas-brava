// Sugestão de alérgenos pelos ingredientes — porte de ALERGENOS_POR_INSUMO
// (scripts/importar_fichas_brava.py). É só sugestão: quem edita decide a marcação final.

import { normalizar } from "./busca";

// Trecho do nome do insumo (sem acento, minúsculo) → alérgenos do catálogo.
const REGRAS: [string, string[]][] = [
  ["farinha de trigo", ["Glúten"]], ["panko", ["Glúten"]], ["pao ", ["Glúten"]], ["biscoito", ["Glúten"]],
  ["massa de pastel", ["Glúten"]], ["bavete", ["Glúten"]], ["rigatoni", ["Glúten"]], ["fettuccine", ["Glúten"]],
  ["shoyu", ["Glúten", "Soja"]],
  ["leite", ["Leite", "Lactose"]], ["manteiga", ["Leite", "Lactose"]], ["queijo", ["Leite", "Lactose"]],
  ["parmesao", ["Leite", "Lactose"]], ["mucarela", ["Leite", "Lactose"]], ["ricota", ["Leite", "Lactose"]],
  ["brie", ["Leite", "Lactose"]], ["gorgonzola", ["Leite", "Lactose"]], ["catupiry", ["Leite", "Lactose"]],
  ["requeijao", ["Leite", "Lactose"]], ["cream cheese", ["Leite", "Lactose"]], ["mascarpone", ["Leite", "Lactose"]],
  ["chantilly", ["Leite", "Lactose"]], ["sorvete", ["Leite", "Lactose"]], ["chocolate branco", ["Leite", "Lactose"]],
  ["ovos", ["Ovo"]], ["ovo ", ["Ovo"]],
  ["sirigado", ["Peixe"]], ["salmao", ["Peixe"]], ["atum", ["Peixe"]],
  ["camarao", ["Crustáceos"]],
  ["castanha", ["Castanha"]],
];

// Falsos positivos da busca por trecho: "leite de coco" não é leite (mas "doce de leite" é);
// "couve-manteiga" não é manteiga.
const EXCECOES: Record<string, string> = { leite: "coco", manteiga: "couve" };

/**
 * Alérgenos sugeridos para uma ficha: pelos nomes dos insumos e herdando os já marcados nas
 * sub-receitas usadas. Devolve nomes do catálogo, em ordem alfabética.
 */
export function sugerirAlergenos(nomesInsumos: string[], alergenosDasSubReceitas: string[] = []): string[] {
  const achados = new Set(alergenosDasSubReceitas);
  for (const nome of nomesInsumos) {
    const alvo = `${normalizar(nome)} `;
    for (const [trecho, alergenos] of REGRAS) {
      const excecao = EXCECOES[trecho];
      if (alvo.includes(trecho) && !(excecao && alvo.includes(excecao) && !alvo.includes("doce"))) {
        for (const a of alergenos) achados.add(a);
      }
    }
  }
  return [...achados].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
