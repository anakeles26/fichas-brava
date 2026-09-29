import type { Metadata } from "next";
import { listarFichas } from "@/lib/fichas";
import { ListaFichas } from "./lista";

export const metadata: Metadata = { title: "Fichas técnicas" };

export default async function PaginaFichas() {
  const fichas = await listarFichas();
  return (
    <>
      <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">Fichas Técnicas</h1>
      <ListaFichas fichas={fichas} />
    </>
  );
}
