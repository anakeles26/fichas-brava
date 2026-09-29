"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icone, SemFoto, Selo } from "@/components/visual";
import { combina } from "@/lib/busca";
import type { FichaResumo } from "@/lib/fichas";
import { formatarQuantidade } from "@/lib/quantidades";

const TODAS = "";
const POR_PAGINA = 12; // igual ao app antigo: 12 cartões (4 linhas de 3) por página

const CAMPO =
  "h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-vinho focus:ring-2 focus:ring-vinho-claro";

function ordenados(valores: (string | null)[]) {
  return [...new Set(valores.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Busca, filtros e paginação rodam no navegador: são poucas dezenas de fichas, então
// filtrar na hora (sem ir ao servidor a cada tecla) é mais rápido na bancada.
export function ListaFichas({ fichas, empresa }: { fichas: FichaResumo[]; empresa: string }) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [alergeno, setAlergeno] = useState(TODAS);
  const [pagina, setPagina] = useState(1);

  const categorias = useMemo(() => ordenados(fichas.map((f) => f.categoria)), [fichas]);
  const alergenos = useMemo(() => ordenados(fichas.flatMap((f) => f.alergenos)), [fichas]);

  const visiveis = fichas.filter(
    (f) =>
      combina(f.nome, busca) &&
      (categoria === TODAS || f.categoria === categoria) &&
      (alergeno === TODAS || f.alergenos.includes(alergeno)),
  );
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const daPagina = visiveis.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  // Filtro novo volta para a primeira página (senão a pessoa cai numa página vazia).
  function filtrar(aplicar: () => void) {
    aplicar();
    setPagina(1);
  }

  return (
    <>
      <h1 className="text-3xl leading-tight font-bold md:text-[44px]">
        Fichas Técnicas{empresa ? ` — ${empresa}` : ""}
      </h1>
      <p className="mb-4 text-gray-500">{visiveis.length} receita(s) encontrada(s)</p>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <input
          type="search"
          value={busca}
          onChange={(e) => filtrar(() => setBusca(e.target.value))}
          placeholder="Buscar por nome..."
          aria-label="Buscar ficha por nome"
          className={CAMPO}
        />
        <select value={categoria} onChange={(e) => filtrar(() => setCategoria(e.target.value))} aria-label="Filtrar por categoria" className={CAMPO}>
          <option value={TODAS}>Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={alergeno} onChange={(e) => filtrar(() => setAlergeno(e.target.value))} aria-label="Filtrar por alérgeno" className={CAMPO}>
          <option value={TODAS}>Todos os alérgenos</option>
          {alergenos.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      {daPagina.length === 0 ? (
        <p className="rounded-lg border border-black/20 p-6 text-center text-gray-600">Nenhuma ficha encontrada.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {daPagina.map((f) => (
            <li key={f.id} className="flex flex-col gap-3 rounded-lg border border-black/20 p-4">
              <SemFoto altura={170}>
                {f.categoria && (
                  <span className="absolute top-3 left-3">
                    <Selo cor="dourado">{f.categoria}</Selo>
                  </span>
                )}
              </SemFoto>
              <h2 className="font-semibold leading-snug">{f.nome}</h2>
              {!f.verificada && (
                <span>
                  <Selo cor="amarelo" icone="error">
                    Não verificada
                  </Selo>
                </span>
              )}
              <p className="text-sm text-gray-600">
                <Icone nome="schedule" /> — · <Icone nome="group" /> {formatarQuantidade(f.rendimento_qtd, f.rendimento_unidade)}
              </p>
              {f.categoria && (
                <span>
                  <Selo cor="dourado">{f.categoria}</Selo>
                </span>
              )}
              <Link
                href={`/fichas/${f.id}`}
                className="mt-auto rounded-lg bg-vinho px-4 py-2 text-center text-sm font-semibold text-white hover:bg-vinho-hover"
              >
                Ver ficha completa
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPaginas > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-2" aria-label="Paginação">
          <button
            type="button"
            onClick={() => setPagina(paginaAtual - 1)}
            disabled={paginaAtual === 1}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <Icone nome="chevron_left" /> Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {paginaAtual} de {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina(paginaAtual + 1)}
            disabled={paginaAtual === totalPaginas}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Próxima <Icone nome="chevron_right" />
          </button>
        </nav>
      )}
    </>
  );
}
