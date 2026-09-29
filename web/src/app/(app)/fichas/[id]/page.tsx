import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import Markdown from "react-markdown";
import { montarComposicao } from "@/lib/composicao";
import { buscarFicha } from "@/lib/fichas";
import { Ingredientes } from "./ingredientes";

// cache(): generateMetadata e a página pedem a mesma ficha — uma consulta só por acesso.
const carregar = cache(async (idTexto: string) => {
  const id = Number(idTexto);
  return Number.isInteger(id) && id > 0 ? buscarFicha(id) : null;
});

export async function generateMetadata({ params }: PageProps<"/fichas/[id]">): Promise<Metadata> {
  const resultado = await carregar((await params).id);
  return { title: resultado?.ficha.nome ?? "Ficha não encontrada" };
}

const VALIDADES = [
  ["validade_refrigerado_dias", "Refrigerado"],
  ["validade_congelado_dias", "Congelado"],
  ["validade_ambiente_dias", "Ambiente"],
] as const;

export default async function PaginaFicha({ params }: PageProps<"/fichas/[id]">) {
  const resultado = await carregar((await params).id);
  if (!resultado) notFound();
  const { ficha, fichas } = resultado;
  const itens = montarComposicao(ficha.id, fichas);
  const validades = VALIDADES.filter(([campo]) => ficha[campo] !== null);

  return (
    <article className="flex flex-col gap-4">
      <Link href="/fichas" className="self-start text-sm text-vinho hover:underline">
        ← Todas as fichas
      </Link>

      <header className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {ficha.categoria && (
            <span className="rounded-full bg-dourado-claro px-2.5 py-0.5 text-xs font-semibold text-dourado-escuro">
              {ficha.categoria}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              ficha.verificada ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
            }`}
          >
            {ficha.verificada ? "Verificada" : "Não verificada"}
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{ficha.nome}</h1>

        {ficha.alergenos.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Alérgenos">
            <span className="text-sm font-semibold text-red-800">⚠ Contém:</span>
            {ficha.alergenos.map((a) => (
              <span key={a.nome} className="rounded-full bg-red-50 px-2.5 py-0.5 text-sm font-medium text-red-800">
                {a.nome}
              </span>
            ))}
          </div>
        )}

        {validades.length > 0 && (
          <p className="mt-3 text-sm text-gray-700">
            <span className="font-semibold">Validade:</span>{" "}
            {validades.map(([campo, rotulo]) => `${rotulo} ${ficha[campo]} ${ficha[campo] === 1 ? "dia" : "dias"}`).join(" · ")}
          </p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Ingredientes itens={itens} rendimentoQtd={ficha.rendimento_qtd} rendimentoUnidade={ficha.rendimento_unidade} />

        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-bold text-vinho-escuro">Modo de preparo</h2>
          {ficha.passos.length === 0 ? (
            <p className="text-gray-600">Sem modo de preparo cadastrado.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {ficha.passos.map((passo, i) => (
                <li key={passo.ordem} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-vinho text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">
                    {passo.descricao}
                    {passo.tempo_min !== null && <span className="ml-1 text-sm text-gray-500">({passo.tempo_min} min)</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {ficha.observacoes && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="mb-2 text-lg font-bold text-vinho-escuro">Observações</h2>
          {/* Markdown sem HTML: o texto vem do cadastro, então nada de tag vira código na tela. */}
          <div className="text-gray-800 [&_em]:text-gray-500 [&_p]:mb-2 [&_strong]:text-vinho-escuro">
            <Markdown skipHtml>{ficha.observacoes}</Markdown>
          </div>
        </section>
      )}
    </article>
  );
}
