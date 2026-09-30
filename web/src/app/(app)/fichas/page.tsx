import type { Metadata } from "next";
import { listarFichas } from "@/lib/fichas";
import { perfilLogado } from "@/lib/sessao";
import { ListaFichas } from "./lista";

export const metadata: Metadata = { title: "Fichas técnicas" };

export default async function PaginaFichas() {
  const perfil = await perfilLogado();
  const gestao = perfil?.gestao;
  // A gestão recebe também as inativas (filtro "Situação"); a cozinha, só as ativas.
  const fichas = await listarFichas(gestao);
  return <ListaFichas fichas={fichas} empresa={perfil?.empresa ?? ""} gestao={gestao} />;
}
