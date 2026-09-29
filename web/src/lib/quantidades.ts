// Quantidades e unidades das fichas — porte de src/fichabase/receitas.py (app Streamlit),
// para a tela mostrar exatamente o mesmo que o app antigo. Funções puras: sem banco nem
// React, testadas em quantidades.test.ts.

export const UNIDADES = ["g", "kg", "ml", "l", "un", "pc"] as const;
export type Unidade = (typeof UNIDADES)[number];

const FATORES: Record<string, number> = { "kg>g": 1000, "g>kg": 0.001, "l>ml": 1000, "ml>l": 0.001 };

/** Converte entre unidades da mesma grandeza (kg↔g, l↔ml). null se não der (ex.: un → kg). */
export function converterUnidade(quantidade: number, de: string, para: string): number | null {
  if (de === para) return quantidade;
  const fator = FATORES[`${de}>${para}`];
  return fator === undefined ? null : quantidade * fator;
}

/** Unidade mais legível na cozinha: 0,1 kg → 100 g; 1500 g → 1,5 kg. Só apresentação. */
export function unidadeDeExibicao(quantidade: number, unidade: string): [number, string] {
  if (unidade === "kg" && quantidade > 0 && quantidade < 1) return [quantidade * 1000, "g"];
  if (unidade === "l" && quantidade > 0 && quantidade < 1) return [quantidade * 1000, "ml"];
  if (unidade === "g" && quantidade >= 1000) return [quantidade / 1000, "kg"];
  if (unidade === "ml" && quantidade >= 1000) return [quantidade / 1000, "l"];
  return [quantidade, unidade];
}

/** 1.5 → "1,5"; 3.0000000000000004 → "3". Até 3 casas decimais, sem zeros sobrando. */
export function formatarNumero(valor: number): string {
  const arredondado = Math.round(valor * 1000) / 1000;
  return String(arredondado).replace(".", ",");
}

/** Texto pronto para a tela ("100 g", "1,5 l"). Zero = ficha sem quantidade → "a gosto". */
export function formatarQuantidade(quantidade: number, unidade: string): string {
  if (!quantidade) return "a gosto";
  const [valor, unidadeExibida] = unidadeDeExibicao(quantidade, unidade);
  return `${formatarNumero(valor)} ${unidadeExibida}`;
}
