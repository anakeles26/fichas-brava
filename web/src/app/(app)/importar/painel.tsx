"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Aviso, ESTILO, Expansor, Icone, Selo } from "@/components/visual";
import type { Categoria } from "@/lib/cadastro";
import type { Alvo } from "@/lib/casamento";
import type { OpcoesEditor } from "@/lib/edicao";
import { type DecisaoFicha, type DecisaoNome, decisoesIniciais, montarImportacao, type Previa, type PreviaNome } from "@/lib/importacao";
import { chave, frase } from "@/lib/leitor-ficha";
import { UNIDADES } from "@/lib/quantidades";
import { BuscaIngrediente, type OpcaoIngrediente } from "../fichas/_editor/busca-ingrediente";
import { importarPlanilhaChef, type LeituraChef, lerPlanilhaChef, type ResultadoImportacao } from "./acoes";

type Props = { opcoes: OpcoesEditor; categoriasFicha: Categoria[]; categoriasInsumo: Categoria[] };

export function PainelImportacao(props: Props) {
  const [leitura, ler, lendo] = useActionState<LeituraChef, FormData>(lerPlanilhaChef, { erro: null, previa: null });
  return (
    <div className="flex flex-col gap-5">
      <form action={ler} className={`${ESTILO.cartao} flex flex-wrap items-center gap-3 p-4`}>
        <Icone nome="upload_file" className="text-2xl text-vinho" />
        <input name="arquivo" type="file" accept=".xlsx" required className="text-sm" />
        <button type="submit" disabled={lendo} className={ESTILO.botaoPrimario}>
          {lendo ? "Lendo a planilha…" : "Ler planilha"}
        </button>
      </form>
      <Aviso erro={leitura.erro} />
      {/* key: uma planilha nova recomeça as decisões do zero */}
      {leitura.previa && <PreviaImportacao key={`${leitura.previa.arquivo}-${leitura.previa.fichas.length}`} previa={leitura.previa} {...props} />}
    </div>
  );
}

function PreviaImportacao({ previa, opcoes, categoriasFicha, categoriasInsumo }: Props & { previa: Previa }) {
  const [decisoes, setDecisoes] = useState(() => decisoesIniciais(previa));
  const [cardapio, setCardapio] = useState("");
  const [incluirObservacoes, setIncluirObservacoes] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [importando, iniciar] = useTransition();

  const opcoesBusca = useMemo<OpcaoIngrediente[]>(
    () =>
      [
        ...opcoes.insumos.map((i) => ({ tipo: "insumo" as const, id: i.id, nome: i.nome, detalhe: i.unidade })),
        ...opcoes.fichas.map((f) => ({ tipo: "sub" as const, id: f.id, nome: f.nome, detalhe: "sub-receita" })),
      ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [opcoes],
  );
  const nomeDaRef = (ref: string) => decisoes.fichas[ref]?.nome ?? ref;

  const mudarNome = (c: string, d: DecisaoNome) => setDecisoes((atual) => ({ ...atual, nomes: { ...atual.nomes, [c]: d } }));
  const mudarFicha = (ref: string, parcial: Partial<DecisaoFicha>) =>
    setDecisoes((atual) => ({ ...atual, fichas: { ...atual.fichas, [ref]: { ...atual.fichas[ref], ...parcial } } }));

  const atencao = previa.nomes.filter((n) => n.casamento.situacao !== "reconhecido" || n.fichaDaPlanilha);
  const reconhecidos = previa.nomes.filter((n) => n.casamento.situacao === "reconhecido" && !n.fichaDaPlanilha);
  const contagem = {
    novas: previa.fichas.filter((f) => !f.vazia && !f.existente).length,
    existentes: previa.fichas.filter((f) => f.existente).length,
    vazias: previa.fichas.filter((f) => f.vazia).length,
  };

  function importar() {
    const r = montarImportacao(previa, decisoes, {
      unidadeDoInsumo: new Map(opcoes.insumos.map((i) => [i.id, i.unidade])),
      alergenosDaFicha: new Map(opcoes.fichas.map((f) => [f.id, f.alergenos])),
      alergenoId: new Map(opcoes.alergenos.map((a) => [a.nome, a.id])),
      cardapio,
      incluirObservacoes,
    });
    if ("erros" in r) {
      setErros(r.erros);
      return;
    }
    const aviso = `Importar agora? ${r.resumo.criar} ficha(s) nova(s), ${r.resumo.substituir} substituída(s), ${r.resumo.pular} pulada(s).`;
    if (!window.confirm(aviso)) return;
    setErros([]);
    iniciar(async () => {
      const resposta = await importarPlanilhaChef(r.pedido);
      if (resposta.erro) setErros([resposta.erro]);
      else setResultado(resposta.resultado);
    });
  }

  if (resultado) {
    return (
      <section className={`${ESTILO.cartao} flex flex-col gap-3 p-5`}>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-[#1e8449]">
          <Icone nome="check_circle" /> Planilha importada
        </h2>
        <p>
          {resultado.fichas_criadas} ficha(s) criada(s), {resultado.fichas_substituidas} substituída(s), {resultado.fichas_puladas} pulada(s),{" "}
          {resultado.insumos_criados} insumo(s) novo(s), {resultado.apelidos_criados} apelido(s) aprendido(s).
        </p>
        <ul className="flex flex-wrap gap-2">
          {Object.entries(resultado.fichas).map(([ref, id]) => (
            <li key={ref}>
              <Link href={`/fichas/${id}`} className={ESTILO.botaoSecundario}>
                <Icone nome="open_in_new" /> {nomeDaRef(ref)}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-500">As fichas importadas entram como &quot;Não verificada&quot; — confira e marque como verificada.</p>
      </section>
    );
  }

  return (
    <>
      <section className={`${ESTILO.cartao} flex flex-col gap-3 p-4`}>
        <h2 className="text-xl font-semibold">{previa.arquivo}</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Selo cor="verde">{contagem.novas} nova(s)</Selo>
          <Selo cor="amarelo">{contagem.existentes} já cadastrada(s)</Selo>
          {contagem.vazias > 0 && <Selo cor="vinho">{contagem.vazias} sem gramagem</Selo>}
          {previa.foraDoModelo.length > 0 && <Selo cor="vinho">Abas fora do modelo (ignoradas): {previa.foraDoModelo.join(", ")}</Selo>}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
          <label className={ESTILO.rotulo}>
            Categoria para todas as fichas desta planilha
            <select
              onChange={(e) => {
                const categoriaId = e.target.value ? Number(e.target.value) : null;
                for (const f of previa.fichas) mudarFicha(f.ref, { categoriaId });
              }}
              className={ESTILO.campo}
              defaultValue=""
            >
              <option value="">Sem categoria (escolher uma a uma)</option>
              {categoriasFicha.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className={ESTILO.rotulo}>
            Cardápio (opcional)
            <input value={cardapio} onChange={(e) => setCardapio(e.target.value)} placeholder="Ex: Executivo semana 8" className={ESTILO.campo} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={incluirObservacoes} onChange={(e) => setIncluirObservacoes(e.target.checked)} className="size-4 accent-vinho" />
          Incluir observações da planilha (cardápio, porções, equipamentos, tempo de cocção, refrigeração)
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Ingredientes</h2>
        {atencao.length === 0 ? (
          <p className="quadro-info text-sm">Todos os {reconhecidos.length} ingredientes foram reconhecidos no cadastro.</p>
        ) : (
          <p className="text-sm text-gray-600">
            {atencao.length} ingrediente(s) pedem sua decisão. A escolha vira um <strong>apelido</strong>: na próxima planilha o app já
            reconhece sozinho.
          </p>
        )}
        {atencao.map((n) => (
          <DecisaoIngrediente
            key={n.chave}
            nome={n}
            decisao={decisoes.nomes[n.chave]}
            aoMudar={(d) => mudarNome(n.chave, d)}
            opcoesBusca={opcoesBusca}
            categoriasInsumo={categoriasInsumo}
            nomeDaRef={nomeDaRef}
          />
        ))}
        {reconhecidos.length > 0 && atencao.length > 0 && (
          <Expansor titulo={`${reconhecidos.length} ingredientes reconhecidos`} icone="check_circle">
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {reconhecidos.map((n) => (
                <li key={n.chave}>
                  {n.exemplo} → <strong>{(decisoes.nomes[n.chave] as { alvo: Alvo }).alvo.nome}</strong>
                </li>
              ))}
            </ul>
          </Expansor>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Fichas</h2>
        {previa.fichas.map((f) => {
          const d = decisoes.fichas[f.ref];
          return (
            <div key={f.ref} className={`${ESTILO.cartao} flex flex-col gap-3 p-4 ${f.vazia || !d.importar ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={d.importar && !f.vazia}
                    disabled={f.vazia}
                    onChange={(e) => mudarFicha(f.ref, { importar: e.target.checked })}
                    className="size-4 accent-vinho"
                  />
                  Aba {f.ficha.aba.trim()}
                </label>
                <span className="text-sm text-gray-500">
                  {f.ficha.itens.length} ingrediente(s) · {f.ficha.passos.length} passo(s) · rendimento {f.ficha.rendimentoTexto || "—"}
                </span>
              </div>
              {!f.vazia && d.importar && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <label className={ESTILO.rotulo}>
                    Nome da ficha
                    <input value={d.nome} onChange={(e) => mudarFicha(f.ref, { nome: e.target.value })} className={ESTILO.campo} />
                  </label>
                  <label className={ESTILO.rotulo}>
                    Categoria
                    <select
                      value={d.categoriaId ?? ""}
                      onChange={(e) => mudarFicha(f.ref, { categoriaId: e.target.value ? Number(e.target.value) : null })}
                      className={ESTILO.campo}
                    >
                      <option value="">Sem categoria</option>
                      {categoriasFicha.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {f.existente && !f.vazia && d.importar && (
                <fieldset className="flex flex-wrap gap-4 rounded-lg bg-[#fcf0d9] px-3 py-2 text-sm text-[#92710a]">
                  <legend className="sr-only">Ficha já cadastrada</legend>
                  <span className="font-semibold">
                    {f.existente.por === "parecido" ? "Parece ser" : "Já cadastrada como"} &quot;{f.existente.nome}&quot;:
                  </span>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={!d.substituir} onChange={() => mudarFicha(f.ref, { substituir: false })} className="accent-vinho" />
                    Pular (manter a atual)
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={d.substituir} onChange={() => mudarFicha(f.ref, { substituir: true })} className="accent-vinho" />
                    Substituir pela da planilha
                  </label>
                </fieldset>
              )}
              {f.avisos.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-amber-800">
                  {f.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              {!f.vazia && d.importar && (
                <Expansor titulo="Ver ingredientes e preparo" icone="visibility">
                  <ul className="mb-3 flex flex-col gap-1 text-sm">
                    {f.ficha.itens.map((item, i) => (
                      <li key={i}>
                        <strong>{item.pesoBruto ?? "—"} g</strong> {frase(item.nome)} → {destino(decisoes.nomes[chave(item.nome)], nomeDaRef)}
                      </li>
                    ))}
                  </ul>
                  <ol className="list-decimal pl-5 text-sm text-gray-700">
                    {f.ficha.passos.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ol>
                </Expansor>
              )}
            </div>
          );
        })}
      </section>

      {erros.length > 0 && (
        <div role="alert" className="rounded-lg bg-[#fdecec] px-4 py-3 text-sm text-[#b42318]">
          <p className="font-semibold">Não foi possível importar:</p>
          <ul className="mt-1 list-disc pl-5">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0">
        <button type="button" onClick={importar} disabled={importando} className={ESTILO.botaoPrimario}>
          <Icone nome="download_done" /> {importando ? "Importando…" : "Importar fichas"}
        </button>
      </div>
    </>
  );
}

function destino(d: DecisaoNome | undefined, nomeDaRef: (ref: string) => string): React.ReactNode {
  if (!d) return <span className="text-amber-700">(sem decisão)</span>;
  if (d.acao === "usar") return <strong>{d.alvo.nome}</strong>;
  if (d.acao === "fichaDaPlanilha") return <strong>{nomeDaRef(d.ref)} (sub-receita desta planilha)</strong>;
  return <strong>{d.nome} (insumo novo)</strong>;
}

function DecisaoIngrediente({
  nome,
  decisao,
  aoMudar,
  opcoesBusca,
  categoriasInsumo,
  nomeDaRef,
}: {
  nome: PreviaNome;
  decisao: DecisaoNome;
  aoMudar: (d: DecisaoNome) => void;
  opcoesBusca: OpcaoIngrediente[];
  categoriasInsumo: Categoria[];
  nomeDaRef: (ref: string) => string;
}) {
  const c = nome.casamento;
  const novoPadrao: DecisaoNome = { acao: "novo", nome: frase(nome.exemplo), unidade: decisao.acao === "novo" ? decisao.unidade : "g", categoriaId: null };
  const alvoAtual = decisao.acao === "usar" ? decisao.alvo : c.situacao === "parecido" ? c.sugestao : null;
  const opcaoAtual = alvoAtual ? (opcoesBusca.find((o) => o.id === alvoAtual.id && (o.tipo === "sub") === (alvoAtual.tipo === "ficha")) ?? null) : null;

  return (
    <div className={`${ESTILO.cartao} flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <strong>{nome.exemplo}</strong>
        {c.situacao === "novo" && !nome.fichaDaPlanilha && <Selo cor="vinho">não encontrado</Selo>}
        {c.situacao === "parecido" && <Selo cor="amarelo">parecido com &quot;{c.sugestao.nome}&quot;</Selo>}
        {nome.fichaDaPlanilha && <Selo cor="dourado">é outra ficha desta planilha</Selo>}
        <span className="text-xs text-gray-500">usado em: {nome.usadoEm.join(", ")}</span>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {nome.fichaDaPlanilha && (
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={decisao.acao === "fichaDaPlanilha"}
              onChange={() => aoMudar({ acao: "fichaDaPlanilha", ref: nome.fichaDaPlanilha! })}
              className="accent-vinho"
            />
            Usar a ficha &quot;{nomeDaRef(nome.fichaDaPlanilha)}&quot; desta planilha
          </label>
        )}
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={decisao.acao === "usar"}
            onChange={() => alvoAtual && aoMudar({ acao: "usar", alvo: alvoAtual })}
            disabled={!alvoAtual}
            className="accent-vinho"
          />
          Usar um insumo ou ficha do cadastro
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={decisao.acao === "novo"} onChange={() => aoMudar(novoPadrao)} className="accent-vinho" />
          Criar insumo novo
        </label>
      </div>

      {decisao.acao !== "fichaDaPlanilha" && (
        <div className="max-w-md">
          <BuscaIngrediente
            rotulo={`Escolher item do cadastro para ${nome.exemplo}`}
            opcoes={opcoesBusca}
            valor={decisao.acao === "usar" ? opcaoAtual : null}
            aoEscolher={(o) => aoMudar({ acao: "usar", alvo: { tipo: o.tipo === "sub" ? "ficha" : "insumo", id: o.id, nome: o.nome } })}
          />
        </div>
      )}

      {decisao.acao === "novo" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_2fr]">
          <label className={ESTILO.rotulo}>
            Nome do insumo novo
            <input value={decisao.nome} onChange={(e) => aoMudar({ ...decisao, nome: e.target.value })} className={ESTILO.campo} />
          </label>
          <label className={ESTILO.rotulo}>
            Unidade
            <select value={decisao.unidade} onChange={(e) => aoMudar({ ...decisao, unidade: e.target.value })} className={ESTILO.campo}>
              {UNIDADES.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label className={ESTILO.rotulo}>
            Categoria
            <select
              value={decisao.categoriaId ?? ""}
              onChange={(e) => aoMudar({ ...decisao, categoriaId: e.target.value ? Number(e.target.value) : null })}
              className={ESTILO.campo}
            >
              <option value="">Sem categoria</option>
              {categoriasInsumo.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
