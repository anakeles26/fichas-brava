"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso, ESTILO, Icone } from "@/components/visual";
import type { Categoria, Resultado } from "@/lib/cadastro";
import { excluirCategoria, salvarCategoria } from "./acoes";

const INICIAL: Resultado = { erro: null, ok: null };

// Mesmas abas do app antigo: cada tipo de categoria não aparece na tela do outro.
const ABAS = [
  { tipo: "insumo", rotulo: "Insumos", icone: "inventory_2", exemplos: "Ex: Frios, Mercearia, Destilados", plural: "insumo(s)" },
  { tipo: "ficha", rotulo: "Fichas técnicas", icone: "menu_book", exemplos: "Ex: Entradas, Pratos, Sobremesas", plural: "ficha(s)" },
] as const;

export function PainelCategorias({ categorias }: { categorias: Categoria[] }) {
  const [aba, setAba] = useState<(typeof ABAS)[number]["tipo"]>("insumo");
  const atual = ABAS.find((a) => a.tipo === aba)!;
  const lista = categorias.filter((c) => c.tipo === aba);

  return (
    <>
      <div className="mb-4 flex gap-6 border-b border-gray-200" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.tipo}
            type="button"
            role="tab"
            aria-selected={aba === a.tipo}
            onClick={() => setAba(a.tipo)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-sm ${
              aba === a.tipo ? "border-vinho font-semibold text-vinho" : "border-transparent text-gray-600 hover:text-vinho"
            }`}
          >
            <Icone nome={a.icone} /> {a.rotulo}
          </button>
        ))}
      </div>

      {/* key: ao trocar de aba, o formulário e a mensagem recomeçam do zero */}
      <NovaCategoria key={aba} tipo={aba} exemplos={atual.exemplos} />

      <div className="mt-4 flex flex-col gap-2">
        {lista.length === 0 && <p className="text-sm text-gray-500">Nenhuma categoria cadastrada ainda.</p>}
        {lista.map((c) => (
          <LinhaCategoria key={c.id} categoria={c} plural={atual.plural} />
        ))}
      </div>
    </>
  );
}

function NovaCategoria({ tipo, exemplos }: { tipo: string; exemplos: string }) {
  const [estado, acao, enviando] = useActionState(salvarCategoria, INICIAL);
  return (
    <form action={acao} className={`${ESTILO.cartao} flex flex-col gap-3 p-4`}>
      <input type="hidden" name="tipo" value={tipo} />
      <label className={ESTILO.rotulo}>
        Nova categoria
        <input name="nome" required placeholder={exemplos} className={ESTILO.campo} />
      </label>
      <Aviso {...estado} />
      <button type="submit" disabled={enviando} className={`${ESTILO.botaoPrimario} self-start`}>
        {enviando ? "Salvando…" : "Adicionar"}
      </button>
    </form>
  );
}

function LinhaCategoria({ categoria, plural }: { categoria: Categoria; plural: string }) {
  const [editando, setEditando] = useState(false);
  const [estado, acao, enviando] = useActionState(async (anterior: Resultado, dados: FormData) => {
    const r = await salvarCategoria(anterior, dados);
    if (!r.erro) setEditando(false);
    return r;
  }, INICIAL);
  const [removendo, iniciarRemocao] = useTransition();
  const [erroRemocao, setErroRemocao] = useState<string | null>(null);

  function remover() {
    const aviso =
      categoria.uso > 0
        ? `Remover "${categoria.nome}"? ${categoria.uso} ${plural} ficarão sem categoria (nada é apagado).`
        : `Remover "${categoria.nome}"?`;
    if (!window.confirm(aviso)) return;
    iniciarRemocao(async () => setErroRemocao((await excluirCategoria(categoria.id)).erro));
  }

  return (
    <div className={`${ESTILO.cartao} flex flex-col gap-2 p-3`}>
      {editando ? (
        <form action={acao} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={categoria.id} />
          <input type="hidden" name="tipo" value={categoria.tipo} />
          <input name="nome" defaultValue={categoria.nome} required autoFocus className={`${ESTILO.campo} max-w-sm flex-1`} />
          <button type="submit" disabled={enviando} className={ESTILO.botaoPrimario}>
            Salvar
          </button>
          <button type="button" onClick={() => setEditando(false)} className={ESTILO.botaoSecundario}>
            Cancelar
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <strong className="flex-1">{categoria.nome}</strong>
          <span className="text-sm text-gray-500">
            {categoria.uso} {plural}
          </span>
          <button type="button" onClick={() => setEditando(true)} className={ESTILO.botaoSecundario}>
            <Icone nome="edit" /> Renomear
          </button>
          <button type="button" onClick={remover} disabled={removendo} className={ESTILO.botaoPerigo}>
            <Icone nome="delete" /> Remover
          </button>
        </div>
      )}
      <Aviso erro={estado.erro ?? erroRemocao} />
    </div>
  );
}
