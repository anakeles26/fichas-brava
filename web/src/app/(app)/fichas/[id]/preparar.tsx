"use client";

import { useEffect, useRef, useState } from "react";
import { Icone } from "@/components/visual";
import type { ItemComposicao } from "@/lib/composicao";
import { formatarNumero, formatarQuantidade } from "@/lib/quantidades";

// Janela "Preparar Receita" do app antigo: multiplicador com − / + e a lista de
// ingredientes já calculada, com as sub-receitas abertas nos próprios insumos (↳).

const PASSO = 0.5;

/** "1,5" ou "1.5" → 1.5; vazio, zero ou negativo → null (mantém o último válido). */
function lerMultiplicador(texto: string): number | null {
  const valor = Number(texto.replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

type Props = {
  nome: string;
  itens: ItemComposicao[];
  rendimentoQtd: number;
  rendimentoUnidade: string;
};

export function PrepararReceita({ nome, itens, rendimentoQtd, rendimentoUnidade }: Props) {
  const janela = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState("1,00");
  const [multiplicador, setMultiplicador] = useState(1);

  function mudarTexto(novo: string) {
    setTexto(novo);
    const valor = lerMultiplicador(novo);
    if (valor !== null) setMultiplicador(valor);
  }

  function somar(delta: number) {
    const novo = Math.max(PASSO, Math.round((multiplicador + delta) * 100) / 100);
    setMultiplicador(novo);
    setTexto(novo.toFixed(2).replace(".", ","));
  }

  // Fecha ao clicar fora da caixa (no fundo escuro).
  useEffect(() => {
    const el = janela.current;
    if (!el) return;
    const fora = (e: MouseEvent) => {
      if (e.target === el) el.close();
    };
    el.addEventListener("click", fora);
    return () => el.removeEventListener("click", fora);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => janela.current?.showModal()}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:border-vinho hover:text-vinho"
      >
        <Icone nome="restaurant" />
        Preparar receita
      </button>

      <dialog
        ref={janela}
        aria-label={`Preparar Receita: ${nome}`}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-xl p-0 shadow-2xl backdrop:bg-black/50"
      >
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">Preparar Receita: {nome}</h2>
            <button type="button" onClick={() => janela.current?.close()} aria-label="Fechar" className="text-gray-600 hover:text-black">
              <Icone nome="close" className="text-2xl" />
            </button>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Revise os ingredientes calculados — sub-receitas são expandidas nos próprios insumos.
          </p>

          <label className="block text-sm" htmlFor="multiplicador">
            Multiplicador
          </label>
          <div className="mt-1 flex items-center rounded-lg border border-gray-300 bg-placeholder/60">
            <input
              id="multiplicador"
              inputMode="decimal"
              value={texto}
              onChange={(e) => mudarTexto(e.target.value)}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button type="button" onClick={() => somar(-PASSO)} aria-label="Diminuir" className="px-3 py-2 text-lg leading-none">
              −
            </button>
            <button type="button" onClick={() => somar(PASSO)} aria-label="Aumentar" className="px-3 py-2 text-lg leading-none">
              +
            </button>
          </div>

          <p className="mt-4">
            <strong>Porções original:</strong> {formatarQuantidade(rendimentoQtd, rendimentoUnidade)}
            {multiplicador !== 1 && (
              <>
                {" "}
                · <strong>Com ×{formatarNumero(multiplicador)}:</strong> {formatarQuantidade(rendimentoQtd * multiplicador, rendimentoUnidade)}
              </>
            )}
          </p>

          <h3 className="mt-5 mb-2 text-lg font-semibold">Ingredientes (calculados)</h3>
          <Linhas itens={itens} fator={multiplicador} nivel={0} />
        </div>
      </dialog>
    </>
  );
}

function Linhas({ itens, fator, nivel }: { itens: ItemComposicao[]; fator: number; nivel: number }) {
  return (
    <ul className="flex flex-col gap-3" style={{ paddingLeft: nivel ? "1rem" : 0 }}>
      {itens.map((item) => (
        <li key={item.chave}>
          {nivel > 0 && "↳ "}
          {item.nome} — <strong>{formatarQuantidade(item.quantidade * fator, item.unidade)}</strong>
          {item.aviso && <span className="block text-sm text-amber-700">{item.aviso}</span>}
          {item.subItens.length > 0 && (
            <div className="mt-3">
              <Linhas itens={item.subItens} fator={fator * item.fatorSub} nivel={nivel + 1} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
