import type { Metadata } from "next";
import { listarCategorias, listarInsumos } from "@/lib/cadastro";
import { perfilLogado } from "@/lib/sessao";
import { PainelInsumos } from "./painel";

export const metadata: Metadata = { title: "Insumos" };

export default async function PaginaInsumos() {
  const [perfil, insumos, categorias] = await Promise.all([perfilLogado(), listarInsumos(), listarCategorias()]);
  return (
    <>
      <h1 className="mb-4 text-3xl leading-tight font-bold md:text-[44px]">Insumos — {perfil?.empresa}</h1>
      <PainelInsumos
        insumos={insumos}
        categorias={categorias.filter((c) => c.tipo === "insumo")}
        gestao={perfil?.papel === "gestao"}
      />
    </>
  );
}
