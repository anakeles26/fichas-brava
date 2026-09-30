"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ESTILO, Icone } from "@/components/visual";
import { sugerirAlergenos } from "@/lib/alergenos";
import type { OpcoesEditor } from "@/lib/edicao";
import {
  type DadosEditor,
  type ItemEditor,
  montarFicha,
  mover,
  type OpcaoFicha,
  type OpcaoInsumo,
  type PassoEditor,
  unidadesCompativeis,
} from "@/lib/editor-ficha";
import { UNIDADES } from "@/lib/quantidades";
import { salvarFicha } from "../acoes";
import { BuscaIngrediente, type OpcaoIngrediente } from "./busca-ingrediente";

let contador = 0;
const novaChave = () => `n${++contador}`;

type Props = { inicial: DadosEditor; opcoes: OpcoesEditor };

// Editor completo (decisão do design: uma tela, um Salvar). Nada vai para o banco até o
// Salvar; o banco grava tudo ou nada.
export function EditorFicha({ inicial, opcoes }: Props) {
  const router = useRouter();
  const [dados, setDados] = useState<DadosEditor>(inicial);
  const [erros, setErros] = useState<{ titulo: string; itens: string[] } | null>(null);
  const [salvando, iniciar] = useTransition();
  const topo = useRef<HTMLDivElement>(null);
  const salvou = useRef(false);

  const insumos = useMemo(() => new Map<number, OpcaoInsumo>(opcoes.insumos.map((i) => [i.id, i])), [opcoes.insumos]);
  const fichas = useMemo(() => new Map<number, OpcaoFicha & { alergenos: string[] }>(opcoes.fichas.map((f) => [f.id, f])), [opcoes.fichas]);
  const opcoesIngrediente = useMemo<OpcaoIngrediente[]>(
    () =>
      [
        ...opcoes.insumos.map((i) => ({ tipo: "insumo" as const, id: i.id, nome: i.nome, detalhe: i.unidade })),
        ...opcoes.fichas
          .filter((f) => f.id !== dados.id)
          .map((f) => ({ tipo: "sub" as const, id: f.id, nome: f.nome, detalhe: f.ativa ? "sub-receita" : "sub-receita (inativa)" })),
      ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [opcoes, dados.id],
  );

  const alterado = JSON.stringify(dados) !== JSON.stringify(inicial);

  // Aviso do navegador ao fechar/recarregar a aba com alterações não salvas.
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (alterado && !salvou.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  const mudar = <K extends keyof DadosEditor>(campo: K, valor: DadosEditor[K]) => setDados((d) => ({ ...d, [campo]: valor }));
  const mudarItem = (n: number, parcial: Partial<ItemEditor>) =>
    mudar("itens", dados.itens.map((item, i) => (i === n ? { ...item, ...parcial } : item)));
  const mudarPasso = (n: number, parcial: Partial<PassoEditor>) =>
    mudar("passos", dados.passos.map((p, i) => (i === n ? { ...p, ...parcial } : p)));

  // Sugestão de alérgenos pelos ingredientes escolhidos (e alérgenos das sub-receitas).
  const sugeridos = useMemo(() => {
    const nomes = dados.itens.filter((i) => i.tipo === "insumo" && i.refId !== null).map((i) => insumos.get(i.refId!)?.nome ?? "");
    const dasSubs = dados.itens.filter((i) => i.tipo === "sub" && i.refId !== null).flatMap((i) => fichas.get(i.refId!)?.alergenos ?? []);
    const porNome = new Map(opcoes.alergenos.map((a) => [a.nome, a.id]));
    return sugerirAlergenos(nomes, dasSubs).map((n) => porNome.get(n)).filter((id): id is number => id !== undefined);
  }, [dados.itens, insumos, fichas, opcoes.alergenos]);
  const faltamSugeridos = sugeridos.filter((id) => !dados.alergenoIds.includes(id));

  function salvar() {
    const r = montarFicha(dados, insumos, fichas);
    if ("erros" in r) {
      setErros({ titulo: "Corrija antes de salvar:", itens: r.erros });
      topo.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    iniciar(async () => {
      const resposta = await salvarFicha(r.ficha);
      if (resposta.erro || resposta.id === null) {
        setErros({ titulo: "Não foi possível salvar:", itens: [resposta.erro ?? "Tente novamente."] });
        topo.current?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      salvou.current = true;
      router.push(`/fichas/${resposta.id}`);
    });
  }

  function cancelar() {
    if (alterado && !window.confirm("Descartar as alterações não salvas?")) return;
    salvou.current = true;
    router.push(dados.id ? `/fichas/${dados.id}` : "/fichas");
  }

  const secao = `${ESTILO.cartao} flex flex-col gap-4 p-4 sm:p-5`;

  return (
    <div className="flex flex-col gap-5" ref={topo}>
      {erros && (
        <div role="alert" className="rounded-lg bg-[#fdecec] px-4 py-3 text-sm text-[#b42318]">
          <p className="font-semibold">{erros.titulo}</p>
          <ul className="mt-1 list-disc pl-5">
            {erros.itens.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 1. Dados */}
      <section className={secao}>
        <h2 className="text-xl font-semibold">Dados da ficha</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className={ESTILO.rotulo}>
            Nome
            <input value={dados.nome} onChange={(e) => mudar("nome", e.target.value)} className={ESTILO.campo} />
          </label>
          <label className={ESTILO.rotulo}>
            Categoria
            <select value={dados.categoriaId} onChange={(e) => mudar("categoriaId", e.target.value)} className={ESTILO.campo}>
              <option value="">Sem categoria</option>
              {opcoes.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <label className={ESTILO.rotulo}>
              Rendimento
              <input inputMode="decimal" value={dados.rendimento} onChange={(e) => mudar("rendimento", e.target.value)} className={ESTILO.campo} />
            </label>
            <label className={ESTILO.rotulo}>
              Unidade
              <select value={dados.rendimentoUnidade} onChange={(e) => mudar("rendimentoUnidade", e.target.value)} className={ESTILO.campo}>
                {UNIDADES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-1 text-sm">Validade (dias) — deixe vazio se não se aplica</legend>
            {(
              [
                ["validadeRefrigerado", "Refrigerado"],
                ["validadeCongelado", "Congelado"],
                ["validadeAmbiente", "Ambiente"],
              ] as const
            ).map(([campo, rotulo]) => (
              <label key={campo} className="flex flex-col gap-1 text-xs text-gray-600">
                {rotulo}
                <input inputMode="numeric" value={dados[campo]} onChange={(e) => mudar(campo, e.target.value)} className={ESTILO.campo} />
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      {/* 2. Ingredientes */}
      <section className={secao}>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Icone nome="format_list_bulleted" /> Ingredientes
        </h2>
        {dados.itens.length === 0 && <p className="text-sm text-gray-500">Nenhum ingrediente ainda.</p>}
        <ol className="flex flex-col gap-3">
          {dados.itens.map((item, n) => {
            const base = item.refId === null ? null : item.tipo === "sub" ? fichas.get(item.refId)?.rendimento_unidade : insumos.get(item.refId)?.unidade;
            const unidades = base ? unidadesCompativeis(base) : [item.unidade];
            const escolhido = opcoesIngrediente.find((o) => o.tipo === item.tipo && o.id === item.refId) ?? null;
            return (
              <li key={item.chave} className="grid grid-cols-1 gap-2 rounded-lg bg-placeholder/60 p-3 lg:grid-cols-[2.5fr_1fr_0.8fr_2fr_auto] lg:items-end">
                <label className={ESTILO.rotulo}>
                  <span className="text-xs text-gray-600">Ingrediente {n + 1}</span>
                  <BuscaIngrediente
                    rotulo={`Ingrediente ${n + 1}`}
                    opcoes={opcoesIngrediente}
                    valor={escolhido}
                    aoEscolher={(o) => {
                      const unidadeBase = o.tipo === "sub" ? fichas.get(o.id)?.rendimento_unidade : insumos.get(o.id)?.unidade;
                      mudarItem(n, { tipo: o.tipo, refId: o.id, unidade: unidadeBase ?? "g" });
                    }}
                  />
                </label>
                <label className={ESTILO.rotulo}>
                  <span className="text-xs text-gray-600">Quantidade</span>
                  <input inputMode="decimal" value={item.quantidade} onChange={(e) => mudarItem(n, { quantidade: e.target.value })} className={ESTILO.campo} />
                </label>
                <label className={ESTILO.rotulo}>
                  <span className="text-xs text-gray-600">Unidade</span>
                  <select value={item.unidade} onChange={(e) => mudarItem(n, { unidade: e.target.value })} className={ESTILO.campo}>
                    {unidades.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </label>
                <label className={ESTILO.rotulo}>
                  <span className="text-xs text-gray-600">Observação (opcional)</span>
                  <input value={item.observacao} onChange={(e) => mudarItem(n, { observacao: e.target.value })} placeholder="Ex: Peso líquido: 130 g" className={ESTILO.campo} />
                </label>
                <BotoesLinha
                  n={n}
                  total={dados.itens.length}
                  aoMover={(passo) => mudar("itens", mover(dados.itens, n, passo))}
                  aoRemover={() => mudar("itens", dados.itens.filter((_, i) => i !== n))}
                />
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() => mudar("itens", [...dados.itens, { chave: novaChave(), tipo: "insumo", refId: null, quantidade: "", unidade: "g", observacao: "" }])}
          className={`${ESTILO.botaoSecundario} self-start`}
        >
          <Icone nome="add" /> Adicionar ingrediente
        </button>
      </section>

      {/* 3. Modo de preparo */}
      <section className={secao}>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Icone nome="menu_book" /> Modo de preparo
        </h2>
        {dados.passos.length === 0 && <p className="text-sm text-gray-500">Nenhum passo ainda.</p>}
        <ol className="flex flex-col gap-3">
          {dados.passos.map((passo, n) => (
            <li key={passo.chave} className="grid grid-cols-[auto_1fr] gap-3 lg:grid-cols-[auto_1fr_7rem_auto] lg:items-start">
              <span className="mt-2 flex size-6 items-center justify-center rounded-full bg-[#dcf3e3] text-xs font-semibold text-[#1e8449]">{n + 1}</span>
              <textarea
                value={passo.descricao}
                onChange={(e) => mudarPasso(n, { descricao: e.target.value })}
                rows={2}
                aria-label={`Passo ${n + 1}`}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-vinho focus:ring-2 focus:ring-vinho-claro"
              />
              <label className="col-start-2 flex flex-col gap-1 text-xs text-gray-600 lg:col-start-auto">
                Tempo (min)
                <input inputMode="numeric" value={passo.tempo} onChange={(e) => mudarPasso(n, { tempo: e.target.value })} className={ESTILO.campo} />
              </label>
              <div className="col-start-2 lg:col-start-auto lg:mt-5">
                <BotoesLinha
                  n={n}
                  total={dados.passos.length}
                  aoMover={(p) => mudar("passos", mover(dados.passos, n, p))}
                  aoRemover={() => mudar("passos", dados.passos.filter((_, i) => i !== n))}
                />
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => mudar("passos", [...dados.passos, { chave: novaChave(), descricao: "", tempo: "" }])}
          className={`${ESTILO.botaoSecundario} self-start`}
        >
          <Icone nome="add" /> Adicionar passo
        </button>
      </section>

      {/* 4. Alérgenos */}
      <section className={secao}>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Icone nome="warning" /> Alérgenos
        </h2>
        {faltamSugeridos.length > 0 && (
          <div className="quadro-info flex flex-wrap items-center gap-2 text-sm">
            <span>
              Pelos ingredientes, sugerimos também:{" "}
              <strong>{faltamSugeridos.map((id) => opcoes.alergenos.find((a) => a.id === id)?.nome).join(", ")}</strong>
            </span>
            <button
              type="button"
              onClick={() => mudar("alergenoIds", [...new Set([...dados.alergenoIds, ...faltamSugeridos])])}
              className={ESTILO.botaoSecundario}
            >
              Aplicar sugestão
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {opcoes.alergenos.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dados.alergenoIds.includes(a.id)}
                onChange={(e) =>
                  mudar("alergenoIds", e.target.checked ? [...dados.alergenoIds, a.id] : dados.alergenoIds.filter((x) => x !== a.id))
                }
                className="size-4 accent-vinho"
              />
              {a.nome}
            </label>
          ))}
        </div>
      </section>

      {/* 5. Observações */}
      <section className={secao}>
        <h2 className="text-xl font-semibold">Observações</h2>
        <textarea
          value={dados.observacoes}
          onChange={(e) => mudar("observacoes", e.target.value)}
          rows={4}
          placeholder="Opcional: descrição do cardápio, equipamentos, orientações…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-vinho focus:ring-2 focus:ring-vinho-claro"
        />
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0">
        {alterado && <span className="mr-auto self-center text-sm text-gray-500">Alterações não salvas</span>}
        <button type="button" onClick={cancelar} className={ESTILO.botaoSecundario}>
          Cancelar
        </button>
        <button type="button" onClick={salvar} disabled={salvando} className={ESTILO.botaoPrimario}>
          <Icone nome="save" /> {salvando ? "Salvando…" : "Salvar ficha técnica"}
        </button>
      </div>
    </div>
  );
}

function BotoesLinha({ n, total, aoMover, aoRemover }: { n: number; total: number; aoMover: (p: -1 | 1) => void; aoRemover: () => void }) {
  const botao = "flex size-9 items-center justify-center rounded-lg border border-gray-300 bg-white hover:border-vinho hover:text-vinho disabled:opacity-40";
  return (
    <div className="flex gap-1">
      <button type="button" onClick={() => aoMover(-1)} disabled={n === 0} aria-label="Subir" className={botao}>
        <Icone nome="arrow_upward" />
      </button>
      <button type="button" onClick={() => aoMover(1)} disabled={n === total - 1} aria-label="Descer" className={botao}>
        <Icone nome="arrow_downward" />
      </button>
      <button type="button" onClick={aoRemover} aria-label="Remover" className={`${botao} hover:!border-[#b42318] hover:!text-[#b42318]`}>
        <Icone nome="delete" />
      </button>
    </div>
  );
}
