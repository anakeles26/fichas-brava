"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso, ESTILO, Expansor, Icone, iconeAlergeno } from "@/components/visual";
import { normalizar } from "@/lib/busca";
import { criarAlergeno, excluirAlergeno, type ResultadoAlergeno } from "./acoes";

type Alergeno = { id: number; nome: string; icone: string | null; descricao: string | null };

const INICIAL: ResultadoAlergeno = { erro: null, ok: null };
// Mesmas opções do app antigo (OPCOES_ICONE_ALERGENO).
const ICONES = [
  "warning", "nutrition", "eco", "avocado_bean", "palette", "waves", "bakery_dining", "local_drink",
  "water_full", "egg", "set_meal", "psychiatry", "grain", "cookie", "icecream", "local_cafe", "liquor", "science", "water_drop",
];

export function PainelAlergenos({ alergenos, master }: { alergenos: Alergeno[]; master: boolean }) {
  const [filtro, setFiltro] = useState("");
  const visiveis = alergenos.filter((a) => normalizar(a.nome).includes(normalizar(filtro)));
  return (
    <>
      {master && (
        <Expansor titulo="Novo alérgeno" icone="add">
          <NovoAlergeno />
        </Expansor>
      )}
      {alergenos.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Nenhum alérgeno cadastrado ainda.</p>
      ) : (
        <>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar..." aria-label="Filtrar" className={`${ESTILO.campo} my-4`} />
          <div className="flex flex-col gap-2">
            {visiveis.map((a) => (
              <Linha key={a.id} alergeno={a} master={master} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function NovoAlergeno() {
  const [estado, acao, enviando] = useActionState(criarAlergeno, INICIAL);
  return (
    <form action={acao} key={estado.ok ?? "novo"} className="flex flex-col gap-3">
      <label className={ESTILO.rotulo}>
        Nome
        <input name="nome" required className={ESTILO.campo} />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">Ícone</legend>
        <div className="flex flex-wrap gap-2">
          {ICONES.map((i, n) => (
            <label key={i} className="cursor-pointer">
              <input type="radio" name="icone" value={i} defaultChecked={n === 0} className="peer sr-only" />
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-600 peer-checked:border-vinho peer-checked:bg-vinho-claro peer-checked:text-vinho">
                <Icone nome={i} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={ESTILO.rotulo}>
        Descrição (opcional)
        <input name="descricao" className={ESTILO.campo} />
      </label>
      <Aviso {...estado} />
      <button type="submit" disabled={enviando} className={`${ESTILO.botaoPrimario} self-start`}>
        {enviando ? "Salvando…" : "Adicionar"}
      </button>
    </form>
  );
}

function Linha({ alergeno: a, master }: { alergeno: Alergeno; master: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  function excluir() {
    if (!window.confirm(`Excluir o alérgeno "${a.nome}"? Ele será removido das fichas que o usam.`)) return;
    iniciar(async () => setErro((await excluirAlergeno(a.id)).erro));
  }
  return (
    <div className={`${ESTILO.cartao} flex flex-col gap-2 p-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <Icone nome={a.icone ?? iconeAlergeno(a.nome)} className="w-8 text-center text-2xl text-gray-500" />
        <strong className="w-36">{a.nome}</strong>
        <span className="flex-1 text-gray-600">{a.descricao}</span>
        {master && (
          <button type="button" onClick={excluir} disabled={pendente} className={ESTILO.botaoPerigo}>
            <Icone nome="delete" /> Excluir
          </button>
        )}
      </div>
      <Aviso erro={erro} />
    </div>
  );
}
