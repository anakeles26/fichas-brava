import type { Metadata } from "next";
import { FormularioSenha } from "./formulario";

export const metadata: Metadata = { title: "Trocar senha" };

export default function PaginaSenha() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold text-vinho-escuro">Trocar senha</h1>
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <FormularioSenha />
      </div>
    </div>
  );
}
