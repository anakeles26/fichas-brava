import type { Metadata } from "next";
import { contarCozinha } from "@/lib/fichas";
import { perfilLogado } from "@/lib/sessao";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const [perfil, numeros] = await Promise.all([perfilLogado(), contarCozinha()]);

  return (
    <>
      <h1 className="mb-4 text-3xl leading-tight font-bold md:text-[44px]">
        Dashboard{perfil?.empresa ? ` — ${perfil.empresa}` : ""}
      </h1>
      <section className="grid grid-cols-1 gap-4 rounded-lg border border-black/20 p-4 sm:grid-cols-2">
        <div>
          <p className="text-sm">Fichas técnicas ativas</p>
          <p className="text-4xl">{numeros.fichasAtivas}</p>
        </div>
        <div>
          <p className="text-sm">Insumos cadastrados</p>
          <p className="text-4xl">{numeros.insumos}</p>
        </div>
      </section>
    </>
  );
}
