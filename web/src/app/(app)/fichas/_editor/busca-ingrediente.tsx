"use client";

import { useId, useMemo, useState } from "react";
import { ESTILO } from "@/components/visual";
import { combina } from "@/lib/busca";

export type OpcaoIngrediente = { tipo: "insumo" | "sub"; id: number; nome: string; detalhe: string };

const MAXIMO = 8;

type Props = {
  opcoes: OpcaoIngrediente[];
  valor: OpcaoIngrediente | null;
  aoEscolher: (opcao: OpcaoIngrediente) => void;
  rotulo: string;
};

/**
 * Caixa de busca única para insumos e sub-receitas (digitar "parm" acha "Parmesão"). Com
 * teclado: setas escolhem, Enter confirma, Esc fecha.
 */
export function BuscaIngrediente({ opcoes, valor, aoEscolher, rotulo }: Props) {
  const idLista = useId();
  const [texto, setTexto] = useState(valor?.nome ?? "");
  const [aberta, setAberta] = useState(false);
  const [destaque, setDestaque] = useState(0);

  const encontradas = useMemo(
    () => (texto.trim() === "" || texto === valor?.nome ? opcoes : opcoes.filter((o) => combina(o.nome, texto))).slice(0, MAXIMO),
    [opcoes, texto, valor],
  );

  function escolher(opcao: OpcaoIngrediente) {
    aoEscolher(opcao);
    setTexto(opcao.nome);
    setAberta(false);
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-label={rotulo}
        aria-expanded={aberta}
        aria-controls={idLista}
        aria-autocomplete="list"
        value={texto}
        placeholder="Buscar insumo ou sub-receita…"
        onChange={(e) => {
          setTexto(e.target.value);
          setAberta(true);
          setDestaque(0);
        }}
        onFocus={() => setAberta(true)}
        // Espera o clique numa opção antes de fechar; volta ao nome escolhido se digitou e saiu.
        onBlur={() => setTimeout(() => {
          setAberta(false);
          setTexto(valor?.nome ?? "");
        }, 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberta(true);
            setDestaque((d) => Math.min(d + 1, encontradas.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setDestaque((d) => Math.max(d - 1, 0));
          } else if (e.key === "Enter" && aberta && encontradas[destaque]) {
            e.preventDefault();
            escolher(encontradas[destaque]);
          } else if (e.key === "Escape") {
            setAberta(false);
          }
        }}
        className={ESTILO.campo}
      />
      {aberta && (
        <ul id={idLista} role="listbox" className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {encontradas.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Nada encontrado. Cadastre o insumo em Insumos.</li>}
          {encontradas.map((o, n) => (
            <li
              key={`${o.tipo}-${o.id}`}
              role="option"
              aria-selected={n === destaque}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o);
              }}
              onMouseEnter={() => setDestaque(n)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${n === destaque ? "bg-vinho-claro" : ""}`}
            >
              <span>{o.nome}</span>
              <span className={`selo ${o.tipo === "sub" ? "selo-dourado" : "selo-vinho"}`}>{o.detalhe}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
