"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { combina } from "@/lib/busca";
import type { FichaResumo } from "@/lib/fichas";
import { formatarQuantidade } from "@/lib/quantidades";

const TODAS = "";

// Busca e filtro rodam no navegador: são poucas dezenas de fichas, então filtrar na
// hora (sem ir ao servidor a cada tecla) é mais rápido para quem está na bancada.
export function ListaFichas({ fichas }: { fichas: FichaResumo[] }) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(TODAS);

  const categorias = useMemo(
    () => [...new Set(fichas.map((f) => f.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [fichas],
  );
  const visiveis = fichas.filter(
    (f) => combina(f.nome, busca) && (categoria === TODAS || f.categoria === categoria),
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome…"
          aria-label="Buscar ficha por nome"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-vinho focus:ring-2 focus:ring-vinho-claro"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoria"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-vinho sm:w-60"
        >
          <option value={TODAS}>Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-sm text-gray-600">
        {visiveis.length} {visiveis.length === 1 ? "ficha" : "fichas"}
      </p>

      {visiveis.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-gray-600 shadow-sm">Nenhuma ficha encontrada.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiveis.map((f) => (
            <li key={f.id}>
              <Link
                href={`/fichas/${f.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-vinho hover:shadow-md"
              >
                {f.categoria && (
                  <span className="self-start rounded-full bg-dourado-claro px-2.5 py-0.5 text-xs font-semibold text-dourado-escuro">
                    {f.categoria}
                  </span>
                )}
                <span className="text-base font-semibold leading-snug">{f.nome}</span>
                <span className="mt-auto flex items-center justify-between gap-2 text-sm text-gray-600">
                  <span>Rende {formatarQuantidade(f.rendimento_qtd, f.rendimento_unidade)}</span>
                  {!f.verificada && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Não verificada
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
