// Composição de uma ficha com as sub-receitas abertas — porte de materializar_itens
// (src/fichabase/receitas.py). Recebe dados simples (já buscados do banco) e devolve a
// árvore para 1x da receita; o multiplicador da tela é só aritmética por cima disso.

import { converterUnidade } from "./quantidades";

export type ItemDados = {
  id: number;
  ordem: number;
  quantidade: number;
  observacao: string | null;
  insumo: { nome: string; unidade: string } | null;
  sub_ficha_id: number | null;
  unidade_sub: string | null;
};

export type FichaDados = {
  id: number;
  nome: string;
  rendimento_qtd: number;
  rendimento_unidade: string;
  itens: ItemDados[];
};

export type ItemComposicao = {
  chave: string;
  nome: string;
  quantidade: number; // para 1x da receita em que o item aparece
  unidade: string;
  observacao: string | null;
  subFichaId: number | null;
  // Quanto da sub-receita entra: quantidade usada / rendimento da sub-ficha.
  fatorSub: number;
  subItens: ItemComposicao[];
  aviso: string | null;
};

/**
 * Monta a composição de `fichaId`. `fichas` deve conter a ficha e todas as sub-fichas
 * alcançáveis. Não abre a sub-receita (e explica no `aviso`) quando ela já apareceu no
 * caminho (circular), não tem rendimento, tem unidade incompatível ou não foi carregada.
 */
export function montarComposicao(
  fichaId: number,
  fichas: ReadonlyMap<number, FichaDados>,
  caminho: ReadonlySet<number> = new Set(),
  prefixo = "",
): ItemComposicao[] {
  const ficha = fichas.get(fichaId);
  if (!ficha) return [];
  const noCaminho = new Set(caminho).add(fichaId);

  return [...ficha.itens]
    .sort((a, b) => a.ordem - b.ordem)
    .map((item) => {
      const chave = `${prefixo}${item.id}`;
      const quantidade = Number(item.quantidade);

      if (item.sub_ficha_id === null) {
        return {
          chave,
          nome: item.insumo?.nome ?? "(insumo removido)",
          quantidade,
          unidade: item.insumo?.unidade ?? "",
          observacao: item.observacao,
          subFichaId: null,
          fatorSub: 1,
          subItens: [],
          aviso: null,
        };
      }

      const sub = fichas.get(item.sub_ficha_id);
      const unidade = item.unidade_sub ?? "";
      const base = {
        chave,
        nome: sub?.nome ?? "(sub-receita indisponível)",
        quantidade,
        unidade,
        observacao: item.observacao,
        subFichaId: item.sub_ficha_id,
        fatorSub: 1,
        subItens: [] as ItemComposicao[],
        aviso: null as string | null,
      };

      if (!sub) return { ...base, aviso: "sub-receita indisponível — não expandido" };
      if (noCaminho.has(sub.id)) return { ...base, aviso: "referência circular — não expandido" };
      const rendimento = Number(sub.rendimento_qtd);
      if (!rendimento) return { ...base, aviso: "sub-receita sem rendimento definido — não expandido" };
      const convertida = converterUnidade(quantidade, unidade, sub.rendimento_unidade);
      if (convertida === null) {
        return { ...base, aviso: "unidade incompatível com o rendimento da sub-receita — não expandido" };
      }
      return {
        ...base,
        fatorSub: convertida / rendimento,
        subItens: montarComposicao(sub.id, fichas, noCaminho, `${chave}.`),
      };
    });
}
