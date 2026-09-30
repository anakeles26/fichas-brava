// Casamento dos nomes da planilha com o cadastro: apelido aprendido → nome igual → parecido.
// Funções puras (os dados vêm do banco antes). Decisão do design: nome desconhecido gera uma
// sugestão, a pessoa decide, e a decisão vira apelido para a próxima planilha.

import { chave } from "./leitor-ficha";

export type Alvo = { tipo: "insumo"; id: number; nome: string } | { tipo: "ficha"; id: number; nome: string };

export type Casamento =
  | { situacao: "reconhecido"; alvo: Alvo; por: "apelido" | "nome" }
  | { situacao: "parecido"; sugestao: Alvo; semelhanca: number }
  | { situacao: "novo" };

export type Apelido = { tipo: "ingrediente" | "prato"; chave: string; insumo_id: number | null; ficha_id: number | null };

export type Cadastro = {
  apelidos: Apelido[];
  insumos: { id: number; nome: string }[];
  fichas: { id: number; nome: string }[];
};

export const SEMELHANCA_MINIMA = 0.6;

/** Distância de edição (Levenshtein): quantas letras trocar, pôr ou tirar para ir de a para b. */
export function distancia(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/** 1 = iguais, 0 = nada em comum (proporcional ao maior nome). */
export function semelhanca(a: string, b: string): number {
  const maior = Math.max(a.length, b.length);
  return maior === 0 ? 1 : 1 - distancia(a, b) / maior;
}

/** Prepara o cadastro para casar muitos nomes rápido (índices por chave). */
export function indexar(cadastro: Cadastro) {
  const insumos = new Map(cadastro.insumos.map((i) => [i.id, i]));
  const fichas = new Map(cadastro.fichas.map((f) => [f.id, f]));
  const porApelido = new Map<string, Alvo>();
  for (const a of cadastro.apelidos) {
    const alvo: Alvo | null =
      a.insumo_id !== null && insumos.has(a.insumo_id)
        ? { tipo: "insumo", ...insumos.get(a.insumo_id)! }
        : a.ficha_id !== null && fichas.has(a.ficha_id)
          ? { tipo: "ficha", ...fichas.get(a.ficha_id)! }
          : null;
    if (alvo) porApelido.set(a.chave, alvo);
  }
  const porNome = new Map<string, Alvo>();
  const todos: { chave: string; alvo: Alvo }[] = [];
  // Fichas primeiro, insumos depois: com nome igual, vale o insumo (é o caso comum).
  for (const f of cadastro.fichas) porNome.set(chave(f.nome), { tipo: "ficha", ...f });
  for (const i of cadastro.insumos) porNome.set(chave(i.nome), { tipo: "insumo", ...i });
  for (const [c, alvo] of porNome) todos.push({ chave: c, alvo });
  return { porApelido, porNome, todos };
}

export function casar(nomePlanilha: string, indice: ReturnType<typeof indexar>): Casamento {
  const c = chave(nomePlanilha);
  const apelido = indice.porApelido.get(c);
  if (apelido) return { situacao: "reconhecido", alvo: apelido, por: "apelido" };
  const igual = indice.porNome.get(c);
  if (igual) return { situacao: "reconhecido", alvo: igual, por: "nome" };

  let melhor: { alvo: Alvo; nota: number } | null = null;
  for (const { chave: outro, alvo } of indice.todos) {
    const nota = semelhanca(c, outro);
    if (!melhor || nota > melhor.nota) melhor = { alvo, nota };
  }
  return melhor && melhor.nota >= SEMELHANCA_MINIMA
    ? { situacao: "parecido", sugestao: melhor.alvo, semelhanca: melhor.nota }
    : { situacao: "novo" };
}

/** Unidade sugerida para um insumo novo: a planilha pesa em gramas, menos ovos (unidade). */
export function unidadeSugerida(nomePlanilha: string): string {
  return /\bOVOS?\b|\bOVO\(/.test(chave(nomePlanilha)) ? "un" : "g";
}
