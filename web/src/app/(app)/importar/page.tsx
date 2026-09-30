import type { Metadata } from "next";
import { listarCategorias } from "@/lib/cadastro";
import { carregarOpcoesEditor } from "@/lib/edicao";
import { perfilLogado } from "@/lib/sessao";
import { PainelImportacao } from "./painel";

export const metadata: Metadata = { title: "Importar planilha" };

export default async function PaginaImportar() {
  const perfil = await perfilLogado();
  if (perfil?.papel !== "gestao") return <p className="text-gray-600">Esta tela é só para a gestão.</p>;
  const [opcoes, categorias] = await Promise.all([carregarOpcoesEditor(), listarCategorias()]);
  return (
    <>
      <h1 className="text-3xl leading-tight font-bold md:text-[44px]">Importar planilha do chef</h1>
      <p className="mb-6 max-w-3xl text-sm text-gray-500">
        Envie a planilha no modelo &quot;FICHA TÉCNICA OPERACIONAL&quot; (uma ficha por aba). Nada é gravado até você conferir a
        prévia e confirmar — e aí entra tudo de uma vez, ou nada.
      </p>
      <PainelImportacao
        opcoes={opcoes}
        categoriasFicha={categorias.filter((c) => c.tipo === "ficha")}
        categoriasInsumo={categorias.filter((c) => c.tipo === "insumo")}
      />
    </>
  );
}
