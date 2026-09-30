import Link from "next/link";
import Markdown from "react-markdown";
import { Icone, iconeAlergeno, SemFoto, Selo } from "@/components/visual";
import type { ItemComposicao } from "@/lib/composicao";
import type { FichaCompleta } from "@/lib/fichas";
import { formatarQuantidade } from "@/lib/quantidades";
import { AcoesFicha } from "./acoes-ficha";
import { PrepararReceita } from "./preparar";

// Conteúdo da ficha completa, no formato do app Streamlit. Separado da página para a
// página cuidar só de carregar os dados (e o componente poder ser visto com dados de exemplo).

const VALIDADES = [
  ["validade_refrigerado_dias", "Refrigerado"],
  ["validade_congelado_dias", "Congelado"],
  ["validade_ambiente_dias", "Ambiente"],
] as const;

const DATA_POR_EXTENSO = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Fortaleza",
});

const CARTAO = "rounded-lg border border-black/20";

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Fortaleza" });

type Props = { ficha: FichaCompleta; itens: ItemComposicao[]; gestao?: boolean };

export function DetalheFicha({ ficha, itens, gestao = false }: Props) {
  const validades = VALIDADES.filter(([campo]) => ficha[campo] !== null);
  const verificacao = [ficha.verificada_por && `por ${ficha.verificada_por}`, ficha.verificada_em && `em ${DATA_CURTA.format(new Date(ficha.verificada_em))}`]
    .filter(Boolean)
    .join(" ");

  return (
    <article className="flex flex-col gap-4">
      {/* Cabeçalho da página: voltar, título e ações */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/fichas" aria-label="Voltar para as fichas" className="flex rounded-lg border border-gray-300 p-1.5 hover:border-vinho hover:text-vinho">
          <Icone nome="arrow_back" />
        </Link>
        <div className="mr-auto">
          <p className="text-lg font-bold">Ficha Técnica</p>
          <p className="text-sm text-gray-500">Detalhes completos da receita</p>
        </div>
        <PrepararReceita
          nome={ficha.nome}
          itens={itens}
          rendimentoQtd={ficha.rendimento_qtd}
          rendimentoUnidade={ficha.rendimento_unidade}
        />
      </div>

      {/* Cartão de identificação */}
      <section className={`${CARTAO} flex flex-col gap-3 p-4`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Icone nome="restaurant" />
              {ficha.nome}
            </h1>
            <p className="text-sm text-gray-500">Criada em {DATA_POR_EXTENSO.format(new Date(ficha.criado_em))}</p>
          </div>
          {gestao && <AcoesFicha id={ficha.id} nome={ficha.nome} ativa={ficha.ativa} verificada={ficha.verificada} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {!ficha.ativa && (
            <Selo cor="vinho" icone="block">
              Inativa
            </Selo>
          )}
          {ficha.verificada ? (
            <Selo cor="verde" icone="check_circle">
              Verificada{verificacao && ` ${verificacao}`}
            </Selo>
          ) : (
            <Selo cor="amarelo" icone="error">
              Não verificada
            </Selo>
          )}
        </div>
        {ficha.categoria && (
          <div>
            <Selo cor="dourado">{ficha.categoria}</Selo>
          </div>
        )}
        {ficha.alergenos.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <Icone nome="warning" /> Contém alérgenos:
            {ficha.alergenos.map((a) => (
              <Selo key={a.nome} cor="dourado" icone={iconeAlergeno(a.nome)}>
                {a.nome}
              </Selo>
            ))}
          </p>
        )}
        {validades.length > 0 && (
          <p className="text-sm">
            <strong>Validade:</strong>{" "}
            {validades.map(([campo, rotulo]) => `${rotulo} ${ficha[campo]} ${ficha[campo] === 1 ? "dia" : "dias"}`).join(" · ")}
          </p>
        )}
      </section>

      {/* Foto + números | ingredientes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-3">
          <SemFoto altura={300} />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[10px] border border-gray-200 px-4 py-3 text-center">
              <p className="text-2xl font-bold">
                <Icone nome="schedule" /> —
              </p>
              <p className="text-xs text-gray-500">Preparo</p>
            </div>
            <div className="rounded-[10px] border border-gray-200 px-4 py-3 text-center">
              <p className="text-2xl font-bold">
                <Icone nome="group" /> {formatarQuantidade(ficha.rendimento_qtd, ficha.rendimento_unidade)}
              </p>
              <p className="text-xs text-gray-500">Rendimento</p>
            </div>
          </div>
        </div>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-2xl font-semibold">
            <Icone nome="format_list_bulleted" /> Ingredientes
          </h2>
          <ul className={`${CARTAO} divide-y divide-gray-200 px-4`}>
            {itens.map((item) => (
              <li key={item.chave} className="flex gap-4 py-3">
                <span className="w-16 shrink-0">
                  <Selo cor="verde">{formatarQuantidade(item.quantidade, item.unidade)}</Selo>
                </span>
                <span className="flex flex-col gap-1">
                  <span>{item.nome}</span>
                  {item.observacao && <span className="text-sm text-gray-500">{item.observacao}</span>}
                  {item.subFichaId !== null && (
                    <Link
                      href={`/fichas/${item.subFichaId}`}
                      className="mt-1 flex w-fit items-center gap-1 rounded-lg border border-gray-300 px-3 py-1 text-sm hover:border-vinho hover:text-vinho"
                    >
                      <Icone nome="open_in_new" /> Ver ficha
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-2xl font-semibold">
          <Icone nome="menu_book" /> Modo de preparo
        </h2>
        <div className={`${CARTAO} p-4`}>
          {ficha.passos.length === 0 ? (
            <p className="text-gray-600">Sem modo de preparo cadastrado.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {ficha.passos.map((passo, i) => (
                <li key={passo.ordem} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#dcf3e3] text-xs font-semibold text-[#1e8449]">
                    {i + 1}
                  </span>
                  <span className="max-w-3xl">
                    {passo.descricao}
                    {passo.tempo_min !== null && <span className="ml-1 text-sm text-gray-500">({passo.tempo_min} min)</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {ficha.observacoes && (
        <section>
          <h2 className="mb-3 text-2xl font-semibold">Observações</h2>
          {/* Markdown sem HTML: o texto vem do cadastro, então nada de tag vira código na tela. */}
          <div className="quadro-info [&_p]:mb-1">
            <Markdown skipHtml>{ficha.observacoes}</Markdown>
          </div>
        </section>
      )}
    </article>
  );
}
