import type { Metadata } from "next";
import { listarFichas } from "@/lib/fichas";
import { perfilLogado } from "@/lib/sessao";
import { ListaFichas } from "./lista";

export const metadata: Metadata = { title: "Fichas técnicas" };

export default async function PaginaFichas() {
  const [fichas, perfil] = await Promise.all([listarFichas(), perfilLogado()]);
  return <ListaFichas fichas={fichas} empresa={perfil?.empresa ?? ""} />;
}
