import type { Metadata } from "next";
import { perfilLogado } from "@/lib/sessao";
import { gestorLogado, listarUsuarios } from "@/lib/usuarios";
import { PainelUsuarios } from "./painel";

export const metadata: Metadata = { title: "Usuários" };

export default async function PaginaUsuarios() {
  const perfil = await perfilLogado();
  const gestor = perfil?.papel === "gestao" ? await gestorLogado() : null;
  if (!gestor) return <p className="text-gray-600">Esta tela é só para a gestão.</p>;

  const usuarios = await listarUsuarios(gestor.id);
  return (
    <>
      <h1 className="text-3xl leading-tight font-bold md:text-[44px]">Usuários</h1>
      <p className="mb-6 text-sm text-gray-500">Crie e gerencie os acessos da equipe de {perfil?.empresa}.</p>
      <PainelUsuarios usuarios={usuarios} />
    </>
  );
}
