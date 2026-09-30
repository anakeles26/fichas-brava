// Importação da planilha do chef: da leitura das abas à prévia, e das decisões da prévia ao
// pedido para a função importar_planilha do banco. Funções puras, testadas em importacao.test.ts.

import { sugerirAlergenos } from "./alergenos";
import { type Alvo, type Casamento, casar, indexar, type Cadastro, unidadeSugerida } from "./casamento";
import { alergenosDeclarados, chave, diasRefrigeracao, type FichaPlanilha, fichaVazia, frase, montarObservacoes, rendimentoEstimadoG } from "./leitor-ficha";

// ── Prévia ────────────────────────────────────────────────────────────────

export type PreviaFicha = {
  ref: string; // "f:<aba>"
  ficha: FichaPlanilha;
  nomeSugerido: string;
  vazia: boolean;
  // Ficha já cadastrada que corresponde a esta aba: pelo apelido do prato, pelo nome igual ou
  // (com aviso) por nome parecido. Padrão: não importar de novo — a pessoa escolhe substituir.
  existente: { id: number; nome: string; por: "apelido" | "nome" | "parecido"; semelhanca?: number } | null;
  avisos: string[];
};

export type PreviaNome = {
  chave: string;
  exemplo: string; // como apareceu na planilha
  casamento: Casamento;
  fichaDaPlanilha: string | null; // ref de outra aba deste arquivo com esse nome (sub-receita nova)
  usadoEm: string[]; // nomes sugeridos das fichas que usam
};

export type Previa = { arquivo: string; fichas: PreviaFicha[]; nomes: PreviaNome[]; foraDoModelo: string[] };

export function montarPrevia(
  arquivo: string,
  abas: FichaPlanilha[],
  foraDoModelo: string[],
  cadastro: Cadastro,
): Previa {
  // Dois índices separados: um nome pode ser prato numa aba e ingrediente em outra ("ABACAXI").
  const indice = indexar({ ...cadastro, apelidos: cadastro.apelidos.filter((a) => a.tipo === "ingrediente") });
  const indiceFichas = indexar({ ...cadastro, insumos: [], apelidos: cadastro.apelidos.filter((a) => a.tipo === "prato") });
  const refPorProduto = new Map(abas.map((a) => [chave(frase(a.produto)), `f:${a.aba}`]));

  const fichas: PreviaFicha[] = abas.map((ficha) => {
    const nomeSugerido = frase(ficha.produto);
    const avisos: string[] = [];
    const vazia = fichaVazia(ficha);
    if (vazia) avisos.push("Aba sem gramagem — não será importada.");
    for (const i of ficha.itens) {
      if (i.pesoLiquido !== null && i.pesoBruto !== null && i.pesoLiquido > i.pesoBruto) {
        avisos.push(`${frase(i.nome)}: peso líquido (${i.pesoLiquido}) maior que o bruto (${i.pesoBruto}).`);
      }
      if (!vazia && !i.pesoBruto) avisos.push(`${frase(i.nome)}: sem peso (vai como "a gosto").`);
    }
    const soma = somaBrutos(ficha);
    const estimado = rendimentoEstimadoG(ficha.rendimentoTexto);
    if (!vazia && ficha.rendimentoG === null && estimado !== null) {
      avisos.push(`Rendimento "${ficha.rendimentoTexto}" interpretado como ${arredondar(estimado)} g (média da faixa, 1 l ≈ 1 kg) — confira.`);
    } else if (!vazia && ficha.rendimentoG === null) {
      avisos.push(`Rendimento "${ficha.rendimentoTexto || "vazio"}" não é um número — será usada a soma dos ingredientes (${arredondar(soma)} g).`);
    } else if (!vazia && ficha.rendimentoG !== null && Math.abs(ficha.rendimentoG - soma) > 1) {
      avisos.push(`Rendimento (${ficha.rendimentoG} g) diferente da soma dos ingredientes (${arredondar(soma)} g).`);
    }
    const prato = casar(ficha.produto, indiceFichas);
    const existente =
      prato.situacao === "reconhecido"
        ? { id: prato.alvo.id, nome: prato.alvo.nome, por: prato.por }
        : prato.situacao === "parecido" && prato.semelhanca >= SEMELHANCA_PRATO
          ? { id: prato.sugestao.id, nome: prato.sugestao.nome, por: "parecido" as const, semelhanca: prato.semelhanca }
          : null;
    if (existente?.por === "parecido") avisos.push(`Parece ser a ficha "${existente.nome}" — confira antes de importar.`);
    return { ref: `f:${ficha.aba}`, ficha, nomeSugerido: existente ? existente.nome : nomeSugerido, vazia, existente, avisos };
  });

  const nomes = new Map<string, PreviaNome>();
  for (const f of fichas) {
    if (f.vazia) continue;
    for (const item of f.ficha.itens) {
      const c = chave(item.nome);
      const existente = nomes.get(c);
      if (existente) {
        if (!existente.usadoEm.includes(f.nomeSugerido)) existente.usadoEm.push(f.nomeSugerido);
        continue;
      }
      const daPlanilha = refPorProduto.get(c);
      nomes.set(c, {
        chave: c,
        exemplo: item.nome,
        casamento: casar(item.nome, indice),
        fichaDaPlanilha: daPlanilha && daPlanilha !== f.ref ? daPlanilha : null,
        usadoEm: [f.nomeSugerido],
      });
    }
  }
  const ordem = { novo: 0, parecido: 1, reconhecido: 2 } as const;
  return {
    arquivo,
    fichas,
    nomes: [...nomes.values()].sort((a, b) => ordem[a.casamento.situacao] - ordem[b.casamento.situacao] || a.chave.localeCompare(b.chave)),
    foraDoModelo,
  };
}

// Nome de prato parecido o bastante para desconfiar de ficha repetida.
const SEMELHANCA_PRATO = 0.75;

function somaBrutos(ficha: FichaPlanilha): number {
  return ficha.itens.reduce((s, i) => s + (i.pesoBruto ?? 0), 0);
}

const arredondar = (n: number) => Math.round(n * 100) / 100;

// ── Decisões da prévia ────────────────────────────────────────────────────

export type DecisaoNome =
  | { acao: "usar"; alvo: Alvo }
  | { acao: "fichaDaPlanilha"; ref: string }
  | { acao: "novo"; nome: string; unidade: string; categoriaId: number | null };

export type DecisaoFicha = { importar: boolean; nome: string; categoriaId: number | null; substituir: boolean };

/** Decisões iniciais: reconhecido → usar; ficha da própria planilha → usá-la; parecido → a sugestão; novo → criar. */
export function decisoesIniciais(previa: Previa): { nomes: Record<string, DecisaoNome>; fichas: Record<string, DecisaoFicha> } {
  const nomes: Record<string, DecisaoNome> = {};
  for (const n of previa.nomes) {
    const c = n.casamento;
    nomes[n.chave] =
      c.situacao === "reconhecido"
        ? { acao: "usar", alvo: c.alvo }
        : n.fichaDaPlanilha
          ? { acao: "fichaDaPlanilha", ref: n.fichaDaPlanilha }
          : c.situacao === "parecido"
            ? { acao: "usar", alvo: c.sugestao }
            : { acao: "novo", nome: frase(n.exemplo), unidade: unidadeSugerida(n.exemplo), categoriaId: null };
  }
  const fichas: Record<string, DecisaoFicha> = {};
  for (const f of previa.fichas) {
    fichas[f.ref] = { importar: !f.vazia, nome: f.nomeSugerido, categoriaId: null, substituir: false };
  }
  return { nomes, fichas };
}

// ── Pedido para o banco ───────────────────────────────────────────────────

export type Contexto = {
  unidadeDoInsumo: ReadonlyMap<number, string>;
  alergenosDaFicha: ReadonlyMap<number, string[]>; // sub-receitas já cadastradas
  alergenoId: ReadonlyMap<string, number>; // catálogo: nome → id
  cardapio: string;
  incluirObservacoes: boolean;
};

/** Planilha pesa em gramas: converte para a unidade do insumo (kg e l ÷ 1000; g, ml, un, pc iguais). */
function naUnidade(gramas: number, unidade: string): number {
  return unidade === "kg" || unidade === "l" ? gramas / 1000 : gramas;
}

export function montarImportacao(
  previa: Previa,
  decisoes: { nomes: Record<string, DecisaoNome>; fichas: Record<string, DecisaoFicha> },
  ctx: Contexto,
): { pedido: Record<string, unknown>; resumo: { criar: number; substituir: number; pular: number } } | { erros: string[] } {
  const erros: string[] = [];
  const importadas = previa.fichas.filter((f) => !f.vazia && decisoes.fichas[f.ref]?.importar && !(f.existente && !decisoes.fichas[f.ref].substituir));
  const refsImportadas = new Set(importadas.map((f) => f.ref));

  const vistos = new Map<string, string>();
  for (const f of importadas) {
    const nome = decisoes.fichas[f.ref].nome.trim();
    if (!nome) erros.push(`Aba "${f.ficha.aba}": informe o nome da ficha.`);
    const c = chave(nome);
    if (vistos.has(c)) erros.push(`Duas abas viram a mesma ficha "${nome}" (${vistos.get(c)} e ${f.ficha.aba}).`);
    vistos.set(c, f.ficha.aba);
  }

  const novosInsumos = new Map<string, { ref: string; nome: string; unidade: string; categoria_id: number | null }>();
  const apelidos = new Map<string, Record<string, unknown>>();
  // Apelidos que já existem no banco apontando para o mesmo alvo: não reenviar (o resumo
  // "apelidos aprendidos" mostraria só os novos de verdade).
  const jaAprendidos = new Set<string>();
  for (const n of previa.nomes) {
    const d = decisoes.nomes[n.chave];
    const c = n.casamento;
    if (c.situacao === "reconhecido" && c.por === "apelido" && d?.acao === "usar" && d.alvo.tipo === c.alvo.tipo && d.alvo.id === c.alvo.id) {
      jaAprendidos.add(n.chave);
    }
  }
  const pratosJaAprendidos = new Set(previa.fichas.filter((f) => f.existente?.por === "apelido").map((f) => chave(f.ficha.produto)));

  const fichasPedido = importadas.map((f) => {
    const dec = decisoes.fichas[f.ref];
    const nomesInsumos: string[] = [];
    const alergenosSubs: string[] = [];
    const itens = f.ficha.itens.map((item) => {
      const c = chave(item.nome);
      const d = decisoes.nomes[c];
      const quantidade = item.pesoBruto ?? 0;
      const observacao =
        item.pesoLiquido !== null && item.pesoLiquido !== item.pesoBruto ? `Peso líquido: ${item.pesoLiquido} g` : null;
      if (!d) {
        erros.push(`"${item.nome}" sem decisão na prévia.`);
        return {};
      }
      if (d.acao === "fichaDaPlanilha") {
        if (!refsImportadas.has(d.ref)) erros.push(`"${item.nome}" usa uma ficha desta planilha que não será importada.`);
        if (c !== chave(decisoes.fichas[d.ref]?.nome ?? "")) apelidos.set(c, { tipo: "ingrediente", chave: c, ficha_ref: d.ref });
        return { sub_ficha_ref: d.ref, quantidade, unidade_sub: "g", observacao };
      }
      if (d.acao === "novo") {
        if (!d.nome.trim()) erros.push(`Informe o nome do insumo novo para "${item.nome}".`);
        const ref = `i:${c}`;
        novosInsumos.set(ref, { ref, nome: d.nome.trim(), unidade: d.unidade, categoria_id: d.categoriaId });
        if (c !== chave(d.nome)) apelidos.set(c, { tipo: "ingrediente", chave: c, insumo_ref: ref });
        nomesInsumos.push(d.nome);
        return { insumo_ref: ref, quantidade: naUnidade(quantidade, d.unidade), observacao };
      }
      const alvo = d.alvo;
      if (c !== chave(alvo.nome) && !jaAprendidos.has(c)) {
        apelidos.set(c, alvo.tipo === "insumo" ? { tipo: "ingrediente", chave: c, insumo_id: alvo.id } : { tipo: "ingrediente", chave: c, ficha_id: alvo.id });
      }
      if (alvo.tipo === "ficha") {
        if (f.existente && dec.substituir && alvo.id === f.existente.id) {
          erros.push(`"${dec.nome}": o ingrediente "${item.nome}" aponta para a própria ficha — escolha outro item para ele.`);
        }
        alergenosSubs.push(...(ctx.alergenosDaFicha.get(alvo.id) ?? []));
        return { sub_ficha_id: alvo.id, quantidade, unidade_sub: "g", observacao };
      }
      nomesInsumos.push(alvo.nome);
      return { insumo_id: alvo.id, quantidade: naUnidade(quantidade, ctx.unidadeDoInsumo.get(alvo.id) ?? "g"), observacao };
    });

    // Aprende o nome do prato como veio na planilha, para reconhecê-lo na próxima vez.
    const chaveProduto = chave(f.ficha.produto);
    if (chaveProduto && chaveProduto !== chave(dec.nome) && !pratosJaAprendidos.has(chaveProduto)) {
      apelidos.set(`prato:${chaveProduto}`, { tipo: "prato", chave: chaveProduto, ficha_ref: f.ref });
    }

    const alergenos = new Set([...alergenosDeclarados(f.ficha.orientacoes), ...sugerirAlergenos(nomesInsumos, alergenosSubs)]);
    const soma = somaBrutos(f.ficha);
    return {
      ref: f.ref,
      id: f.existente && dec.substituir ? f.existente.id : null,
      nome: dec.nome.trim(),
      categoria_id: dec.categoriaId,
      rendimento_qtd: f.ficha.rendimentoG ?? rendimentoEstimadoG(f.ficha.rendimentoTexto) ?? (soma > 0 ? soma : 1),
      rendimento_unidade: "g",
      validade_refrigerado_dias: diasRefrigeracao(f.ficha.refrigeracao),
      observacoes: ctx.incluirObservacoes ? montarObservacoes(f.ficha, ctx.cardapio) : null,
      passos: f.ficha.passos.map((descricao) => ({ descricao })),
      alergeno_ids: [...alergenos].map((a) => ctx.alergenoId.get(a)).filter((id): id is number => id !== undefined),
      itens,
    };
  });

  if (fichasPedido.length === 0) erros.push("Nenhuma ficha marcada para importar.");
  if (erros.length) return { erros: [...new Set(erros)] };

  const substituir = fichasPedido.filter((f) => f.id !== null).length;
  const pular = previa.fichas.length - fichasPedido.length;
  return {
    pedido: {
      arquivo: previa.arquivo,
      puladas: pular,
      novos_insumos: [...novosInsumos.values()],
      fichas: fichasPedido,
      apelidos: [...apelidos.values()],
    },
    resumo: { criar: fichasPedido.length - substituir, substituir, pular },
  };
}
