"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, ESTILO, Icone } from "@/components/visual";
import { definirFichaAtiva, verificarFicha } from "../acoes";

type Props = { id: number; nome: string; ativa: boolean; verificada: boolean };

/** Botões da gestão no cabeçalho da ficha (a cozinha não vê; o banco também recusa). */
export function AcoesFicha({ id, nome, ativa, verificada }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function executar(acao: () => Promise<string | null>) {
    iniciar(async () => setErro(await acao()));
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {!verificada && ativa && (
          <button
            type="button"
            disabled={enviando}
            onClick={() => window.confirm(`Confirmar que "${nome}" foi conferida (quantidades e preparo)?`) && executar(() => verificarFicha(id))}
            className={ESTILO.botaoSecundario}
          >
            <Icone nome="verified" /> Marcar como verificada
          </button>
        )}
        {ativa ? (
          <button
            type="button"
            disabled={enviando}
            onClick={() =>
              window.confirm(`Inativar "${nome}"? Ela some da lista da cozinha, mas continua valendo como sub-receita.`) &&
              executar(() => definirFichaAtiva(id, false))
            }
            className={ESTILO.botaoPerigo}
          >
            <Icone nome="block" /> Inativar
          </button>
        ) : (
          <button type="button" disabled={enviando} onClick={() => executar(() => definirFichaAtiva(id, true))} className={ESTILO.botaoSecundario}>
            <Icone nome="restart_alt" /> Reativar
          </button>
        )}
        <Link href={`/fichas/${id}/editar`} className={ESTILO.botaoPrimario}>
          <Icone nome="edit" /> Editar ficha
        </Link>
      </div>
      <Aviso erro={erro} />
    </div>
  );
}
