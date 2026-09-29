import type { Metadata } from "next";
import Link from "next/link";
import { contarCozinha } from "@/lib/fichas";
import { perfilLogado } from "@/lib/sessao";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const [perfil, numeros] = await Promise.all([perfilLogado(), contarCozinha()]);

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">
        Dashboard{perfil?.empresa ? ` — ${perfil.empresa}` : ""}
      </h1>
      <section className="rounded-xl border border-gray-200 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Cozinha</h2>
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Link href="/fichas" className="group">
            <p className="text-sm text-gray-600">Fichas técnicas ativas</p>
            <p className="mt-1 text-4xl text-vinho-escuro group-hover:text-vinho">{numeros.fichasAtivas}</p>
          </Link>
          <div>
            <p className="text-sm text-gray-600">Insumos cadastrados</p>
            <p className="mt-1 text-4xl text-vinho-escuro">{numeros.insumos}</p>
          </div>
        </div>
      </section>
    </>
  );
}
