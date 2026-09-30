import type { Metadata } from "next";
import { listarCategorias } from "@/lib/cadastro";
import { perfilLogado } from "@/lib/sessao";
import { PainelCategorias } from "./painel";

export const metadata: Metadata = { title: "Categorias" };

export default async function PaginaCategorias() {
  const perfil = await perfilLogado();
  if (perfil?.papel !== "gestao") {
    return <p className="text-gray-600">Esta tela é só para a gestão.</p>;
  }
  const categorias = await listarCategorias();
  return (
    <>
      <h1 className="text-3xl leading-tight font-bold md:text-[44px]">Categorias — {perfil.empresa}</h1>
      <p className="mb-6 text-sm text-gray-500">
        As categorias de insumos organizam o estoque e as de fichas técnicas organizam o cardápio — uma não aparece
        na tela da outra.
      </p>
      <PainelCategorias categorias={categorias} />
    </>
  );
}
