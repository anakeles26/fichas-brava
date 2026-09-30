"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Aviso, ESTILO, Expansor, Icone, Selo } from "@/components/visual";
import { combina } from "@/lib/busca";
import type { Categoria, Insumo, Resultado } from "@/lib/cadastro";
import { UNIDADES } from "@/lib/quantidades";
import { importarInsumos, type LeituraPlanilha, lerPlanilhaInsumos, mudarCategoria, salvarInsumo } from "./acoes";

const INICIAL: Resultado = { erro: null, ok: null };
const POR_PAGINA = 25; // igual ao app antigo
const TODAS = "__todas";
const SEM = "__sem";

type Props = { insumos: Insumo[]; categorias: Categoria[]; gestao: boolean };

export function PainelInsumos({ insumos, categorias, gestao }: Props) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState(TODAS);
  const [pagina, setPagina] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const visiveis = useMemo(
    () =>
      insumos.filter(
        (i) =>
          combina(i.nome, busca) &&
          (filtro === TODAS || (filtro === SEM ? i.categoria_id === null : String(i.categoria_id) === filtro)),
      ),
    [insumos, busca, filtro],
  );
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const daPagina = visiveis.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function alternar(id: number) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {gestao && (
        <>
          <Expansor titulo="Novo insumo" icone="add">
            <FormInsumo categorias={categorias} />
          </Expansor>
          <Expansor titulo="Importar planilha" icone="upload_file">
            <ImportarPlanilha />
          </Expansor>
          <Expansor titulo="Edição em massa (mudar categoria de vários)" icone="sell">
            <EdicaoEmMassa
              categorias={categorias}
              selecionados={selecionados}
              visiveis={visiveis}
              aoSelecionar={setSelecionados}
            />
          </Expansor>
        </>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
        <label className={ESTILO.rotulo}>
          Buscar insumo
          <input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por nome..."
            className={ESTILO.campo}
          />
        </label>
        <label className={ESTILO.rotulo}>
          Categoria
          <select
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setPagina(1);
            }}
            className={ESTILO.campo}
          >
            <option value={TODAS}>Todas</option>
            <option value={SEM}>Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-gray-500">{visiveis.length} insumo(s) encontrado(s).</p>

      {daPagina.length === 0 ? (
        <p className="quadro-info text-sm">Nenhum insumo encontrado com esses filtros.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {daPagina.map((i) => (
            <LinhaInsumo
              key={i.id}
              insumo={i}
              categorias={categorias}
              gestao={gestao}
              selecionado={selecionados.has(i.id)}
              aoSelecionar={() => alternar(i.id)}
            />
          ))}
        </ul>
      )}

      {totalPaginas > 1 && (
        <nav className="mt-2 flex items-center justify-between gap-2" aria-label="Paginação">
          <button type="button" onClick={() => setPagina(paginaAtual - 1)} disabled={paginaAtual === 1} className={ESTILO.botaoSecundario}>
            <Icone nome="chevron_left" /> Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {paginaAtual} de {totalPaginas}
          </span>
          <button type="button" onClick={() => setPagina(paginaAtual + 1)} disabled={paginaAtual === totalPaginas} className={ESTILO.botaoSecundario}>
            Próxima <Icone nome="chevron_right" />
          </button>
        </nav>
      )}
    </div>
  );
}

function CamposInsumo({ categorias, insumo }: { categorias: Categoria[]; insumo?: Insumo }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_2fr]">
      <label className={ESTILO.rotulo}>
        Nome
        <input name="nome" required defaultValue={insumo?.nome} className={ESTILO.campo} />
      </label>
      <label className={ESTILO.rotulo}>
        Unidade de medida
        <select name="unidade" defaultValue={insumo?.unidade ?? "g"} className={ESTILO.campo}>
          {UNIDADES.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      <label className={ESTILO.rotulo}>
        Categoria
        <select name="categoria_id" defaultValue={insumo?.categoria_id ?? ""} className={ESTILO.campo}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function FormInsumo({ categorias }: { categorias: Categoria[] }) {
  const [estado, acao, enviando] = useActionState(salvarInsumo, INICIAL);
  return (
    // key: depois de salvar com sucesso o formulário volta vazio para o próximo insumo
    <form key={estado.ok ?? "novo"} action={acao} className="flex flex-col gap-3">
      <CamposInsumo categorias={categorias} />
      <Aviso {...estado} />
      <button type="submit" disabled={enviando} className={`${ESTILO.botaoPrimario} self-start`}>
        {enviando ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}

function LinhaInsumo({
  insumo,
  categorias,
  gestao,
  selecionado,
  aoSelecionar,
}: {
  insumo: Insumo;
  categorias: Categoria[];
  gestao: boolean;
  selecionado: boolean;
  aoSelecionar: () => void;
}) {
  const [estado, acao, enviando] = useActionState(salvarInsumo, INICIAL);
  return (
    <li className={`${ESTILO.cartao} flex flex-col gap-2 p-3`}>
      <div className="flex items-center gap-3">
        {gestao && (
          <input type="checkbox" checked={selecionado} onChange={aoSelecionar} aria-label={`Selecionar ${insumo.nome}`} className="size-4 accent-vinho" />
        )}
        <strong className="mr-auto">{insumo.nome}</strong>
        <Selo cor="dourado">{insumo.unidade}</Selo>
        {insumo.categoria && <Selo cor="vinho">{insumo.categoria}</Selo>}
      </div>
      {gestao && (
        <Expansor titulo="Editar" icone="edit">
          <form action={acao} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={insumo.id} />
            <CamposInsumo categorias={categorias} insumo={insumo} />
            <Aviso {...estado} />
            <button type="submit" disabled={enviando} className={`${ESTILO.botaoPrimario} self-start`}>
              {enviando ? "Salvando…" : "Salvar alterações"}
            </button>
          </form>
        </Expansor>
      )}
    </li>
  );
}

function EdicaoEmMassa({
  categorias,
  selecionados,
  visiveis,
  aoSelecionar,
}: {
  categorias: Categoria[];
  selecionados: Set<number>;
  visiveis: Insumo[];
  aoSelecionar: (s: Set<number>) => void;
}) {
  const [categoria, setCategoria] = useState("");
  const [resultado, setResultado] = useState<Resultado>(INICIAL);
  const [enviando, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600">
        Marque os insumos na lista abaixo (a busca e o filtro ajudam) e escolha a nova categoria.{" "}
        <strong>{selecionados.size}</strong> selecionado(s).
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => aoSelecionar(new Set(visiveis.map((i) => i.id)))} className={ESTILO.botaoSecundario}>
          Selecionar os {visiveis.length} da lista
        </button>
        <button type="button" onClick={() => aoSelecionar(new Set())} className={ESTILO.botaoSecundario}>
          Limpar seleção
        </button>
      </div>
      <label className={`${ESTILO.rotulo} max-w-sm`}>
        Nova categoria
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={ESTILO.campo}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <Aviso {...resultado} />
      <button
        type="button"
        disabled={enviando || selecionados.size === 0}
        onClick={() =>
          iniciar(async () => {
            const r = await mudarCategoria([...selecionados], categoria ? Number(categoria) : null);
            setResultado(r);
            if (!r.erro) aoSelecionar(new Set());
          })
        }
        className={`${ESTILO.botaoPrimario} self-start`}
      >
        {enviando ? "Aplicando…" : `Aplicar a ${selecionados.size} insumo(s)`}
      </button>
    </div>
  );
}

const LEITURA_INICIAL: LeituraPlanilha = { erro: null, arquivo: "", linhas: [] };

function ImportarPlanilha() {
  const [leitura, ler, lendo] = useActionState(lerPlanilhaInsumos, LEITURA_INICIAL);
  const [resultado, setResultado] = useState<Resultado>(INICIAL);
  const [importando, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600">
        Aceita Excel (.xlsx) ou CSV. Precisa ter uma coluna <strong>Nome</strong>; as colunas <strong>Unidade</strong> e{" "}
        <strong>Categoria</strong> são opcionais. Insumos que já existem (mesmo nome) são ignorados, nada é sobrescrito.
      </p>
      <a href="/insumos/modelo" className={`${ESTILO.botaoSecundario} self-start`}>
        <Icone nome="download" /> Baixar planilha modelo
      </a>
      <form action={ler} className="flex flex-wrap items-center gap-2">
        <input name="arquivo" type="file" accept=".xlsx,.csv" required className="text-sm" />
        <button type="submit" disabled={lendo} className={ESTILO.botaoSecundario}>
          {lendo ? "Lendo…" : "Ver prévia"}
        </button>
      </form>
      <Aviso erro={leitura.erro} />

      {leitura.linhas.length > 0 && (
        <>
          <p className="text-sm">
            <strong>{leitura.linhas.length} linha(s)</strong> encontrada(s) em {leitura.arquivo}. Prévia:
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-placeholder">
                <tr>
                  <th className="px-3 py-2 font-semibold">Nome</th>
                  <th className="px-3 py-2 font-semibold">Unidade</th>
                  <th className="px-3 py-2 font-semibold">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {leitura.linhas.slice(0, 10).map((l, n) => (
                  <tr key={n} className="border-t border-gray-100">
                    <td className="px-3 py-1.5">{l.nome}</td>
                    <td className="px-3 py-1.5">{l.unidade}</td>
                    <td className="px-3 py-1.5">{l.categoria ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Aviso {...resultado} />
          <button
            type="button"
            disabled={importando || resultado.ok !== null}
            onClick={() => iniciar(async () => setResultado(await importarInsumos(leitura.linhas)))}
            className={`${ESTILO.botaoPrimario} self-start`}
          >
            {importando ? "Importando…" : "Importar insumos"}
          </button>
        </>
      )}
    </div>
  );
}
