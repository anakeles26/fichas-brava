import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { montarComposicao } from "@/lib/composicao";
import { buscarFicha } from "@/lib/fichas";
import { DetalheFicha } from "./detalhe";

// cache(): generateMetadata e a página pedem a mesma ficha — uma consulta só por acesso.
const carregar = cache(async (idTexto: string) => {
  const id = Number(idTexto);
  return Number.isInteger(id) && id > 0 ? buscarFicha(id) : null;
});

export async function generateMetadata({ params }: PageProps<"/fichas/[id]">): Promise<Metadata> {
  const resultado = await carregar((await params).id);
  return { title: resultado?.ficha.nome ?? "Ficha não encontrada" };
}

export default async function PaginaFicha({ params }: PageProps<"/fichas/[id]">) {
  const resultado = await carregar((await params).id);
  if (!resultado) notFound();
  const { ficha, fichas } = resultado;
  return <DetalheFicha ficha={ficha} itens={montarComposicao(ficha.id, fichas)} />;
}
