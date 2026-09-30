import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buscarFichaParaEdicao, carregarOpcoesEditor } from "@/lib/edicao";
import { paraEditor } from "@/lib/editor-ficha";
import { perfilLogado } from "@/lib/sessao";
import { EditorFicha } from "../../_editor/editor";

export const metadata: Metadata = { title: "Editar ficha" };

export default async function PaginaEditarFicha({ params }: PageProps<"/fichas/[id]/editar">) {
  const perfil = await perfilLogado();
  if (perfil?.papel !== "gestao") return <p className="text-gray-600">Só a gestão edita fichas.</p>;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [ficha, opcoes] = await Promise.all([buscarFichaParaEdicao(id), carregarOpcoesEditor()]);
  if (!ficha) notFound();
  return (
    <>
      <h1 className="mb-6 text-3xl leading-tight font-bold md:text-[44px]">Editar ficha</h1>
      <EditorFicha inicial={paraEditor(ficha, new Map(opcoes.insumos.map((i) => [i.id, i])))} opcoes={opcoes} />
    </>
  );
}
