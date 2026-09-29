"use client";

import Link from "next/link";
import { useState } from "react";
import type { ItemComposicao } from "@/lib/composicao";
import { formatarNumero, formatarQuantidade } from "@/lib/quantidades";

const ATALHOS = [0.5, 1, 2, 3];

/** "1,5" ou "1.5" → 1.5; vazio, zero ou negativo → null (mantém o último válido). */
function lerMultiplicador(texto: string): number | null {
  const valor = Number(texto.replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

type Props = {
  itens: ItemComposicao[];
  rendimentoQtd: number;
  rendimentoUnidade: string;
};

export function Ingredientes({ itens, rendimentoQtd, rendimentoUnidade }: Props) {
  const [texto, setTexto] = useState("1");
  const [multiplicador, setMultiplicador] = useState(1);

  function mudar(novoTexto: string) {
    setTexto(novoTexto);
    const valor = lerMultiplicador(novoTexto);
    if (valor !== null) setMultiplicador(valor);
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 rounded-xl bg-vinho-claro p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-vinho-escuro">Multiplicar receita</span>
          <div className="flex gap-1">
            {ATALHOS.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => mudar(formatarNumero(valor))}
                aria-pressed={multiplicador === valor}
                className={`min-w-12 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  multiplicador === valor ? "bg-vinho text-white" : "bg-white text-vinho hover:bg-white/70"
                }`}
              >
                ×{formatarNumero(valor)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-sm">
            ×
            <input
              inputMode="decimal"
              value={texto}
              onChange={(e) => mudar(e.target.value)}
              aria-label="Multiplicador"
              className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-base outline-none focus:border-vinho"
            />
          </label>
        </div>
        <p className="mt-2 text-sm text-vinho-escuro">
          Rendimento: <strong>{formatarQuantidade(rendimentoQtd * multiplicador, rendimentoUnidade)}</strong>
        </p>
      </div>

      <h2 className="mb-2 text-lg font-bold text-vinho-escuro">Ingredientes</h2>
      <ListaItens itens={itens} fator={multiplicador} />
    </section>
  );
}

function ListaItens({ itens, fator }: { itens: ItemComposicao[]; fator: number }) {
  return (
    <ul className="divide-y divide-gray-100">
      {itens.map((item) => (
        <Item key={item.chave} item={item} fator={fator} />
      ))}
    </ul>
  );
}

function Item({ item, fator }: { item: ItemComposicao; fator: number }) {
  const [aberto, setAberto] = useState(false);
  const temComposicao = item.subItens.length > 0;

  return (
    <li className="py-2">
      <div className="flex items-baseline gap-3">
        <span className="w-20 shrink-0 text-right font-semibold tabular-nums">
          {formatarQuantidade(item.quantidade * fator, item.unidade)}
        </span>
        <span className="flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span>{item.nome}</span>
            {item.subFichaId !== null && (
              <span className="rounded-full bg-dourado-claro px-2 py-0.5 text-xs font-medium text-dourado-escuro">
                sub-receita
              </span>
            )}
          </span>
          {item.observacao && <span className="block text-sm text-gray-500">{item.observacao}</span>}
          {item.aviso && <span className="block text-sm text-amber-700">{item.aviso}</span>}
          {item.subFichaId !== null && (
            <span className="mt-1 flex flex-wrap gap-3 text-sm">
              {temComposicao && (
                <button
                  type="button"
                  onClick={() => setAberto(!aberto)}
                  aria-expanded={aberto}
                  className="font-medium text-vinho underline-offset-2 hover:underline"
                >
                  {aberto ? "Esconder composição" : "Ver composição"}
                </button>
              )}
              <Link href={`/fichas/${item.subFichaId}`} className="text-gray-600 underline-offset-2 hover:underline">
                Abrir ficha
              </Link>
            </span>
          )}
        </span>
      </div>
      {aberto && (
        <div className="mt-2 ml-6 border-l-2 border-dourado pl-3 sm:ml-23">
          <ListaItens itens={item.subItens} fator={fator * item.fatorSub} />
        </div>
      )}
    </li>
  );
}
