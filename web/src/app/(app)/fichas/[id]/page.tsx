import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { montarComposicao } from "@/lib/composicao";
import { buscarFicha } from "@/lib/fichas";
import { perfilLogado } from "@/lib/sessao";
import { DetalheFicha } from "./detalhe";

// cache(): generateMetadata e a página pedem a mesma ficha — uma consulta só por acesso.
// A gestão também abre fichas inativas (para poder reativar); a cozinha não.
const carregar = cache(async (idTexto: string) => {
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) return null;
  const perfil = await perfilLogado();
  return buscarFicha(id, perfil?.gestao);
});

export async function generateMetadata({ params }: PageProps<"/fichas/[id]">): Promise<Metadata> {
  const resultado = await carregar((await params).id);
  return { title: resultado?.ficha.nome ?? "Ficha não encontrada" };
}

export default async function PaginaFicha({ params }: PageProps<"/fichas/[id]">) {
  const [resultado, perfil] = await Promise.all([carregar((await params).id), perfilLogado()]);
  if (!resultado) notFound();
  const { ficha, fichas } = resultado;
  return <DetalheFicha ficha={ficha} itens={montarComposicao(ficha.id, fichas)} gestao={perfil?.gestao} />;
}
