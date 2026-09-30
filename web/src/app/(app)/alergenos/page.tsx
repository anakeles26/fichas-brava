import type { Metadata } from "next";
import { perfilLogado } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { PainelAlergenos } from "./painel";

export const metadata: Metadata = { title: "Alérgenos" };

export default async function PaginaAlergenos() {
  const perfil = await perfilLogado();
  if (!perfil?.gestao) return <p className="text-gray-600">Você não tem permissão para acessar os alérgenos.</p>;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("alergenos").select("id, nome, icone, descricao").order("nome");
  if (error) throw new Error(`Erro ao listar alérgenos: ${error.message}`);
  return (
    <>
      <h1 className="text-3xl leading-tight font-bold md:text-[44px]">Alérgenos</h1>
      <p className="mb-6 text-sm text-gray-500">
        Catálogo compartilhado por todas as unidades (não é por empresa) — usado para marcar quais alérgenos cada ficha técnica contém.
      </p>
      <PainelAlergenos alergenos={data} master={perfil.papel === "admin_master"} />
    </>
  );
}
