import type { Metadata } from "next";
import { listarFichas } from "@/lib/fichas";
import { ListaFichas } from "./lista";

export const metadata: Metadata = { title: "Fichas técnicas" };

export default async function PaginaFichas() {
  const fichas = await listarFichas();
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold text-vinho-escuro">Fichas técnicas</h1>
      <ListaFichas fichas={fichas} />
    </>
  );
}
