import type { Metadata } from "next";
import { carregarOpcoesEditor } from "@/lib/edicao";
import { paraEditor } from "@/lib/editor-ficha";
import { perfilLogado } from "@/lib/sessao";
import { EditorFicha } from "../_editor/editor";

export const metadata: Metadata = { title: "Nova ficha técnica" };

export default async function PaginaNovaFicha() {
  const perfil = await perfilLogado();
  if (perfil?.papel !== "gestao") return <p className="text-gray-600">Só a gestão cria fichas.</p>;
  const opcoes = await carregarOpcoesEditor();
  return (
    <>
      <h1 className="mb-6 text-3xl leading-tight font-bold md:text-[44px]">Nova ficha técnica</h1>
      <EditorFicha inicial={paraEditor(null, new Map())} opcoes={opcoes} />
    </>
  );
}
