import type { Metadata } from "next";
import { FormularioSenha } from "./formulario";

export const metadata: Metadata = { title: "Trocar senha" };

export default function PaginaSenha() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">Trocar senha</h1>
      <div className="rounded-2xl border border-gray-200 p-6">
        <FormularioSenha />
      </div>
    </div>
  );
}
