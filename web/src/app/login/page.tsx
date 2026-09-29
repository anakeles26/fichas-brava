import type { Metadata } from "next";
import Image from "next/image";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { proximo } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-vinho px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 rounded-2xl bg-white px-6 py-4 text-center shadow-lg">
          <Image src="/logo-brava.png" alt="Brava Wine" width={747} height={285} priority className="mx-auto h-auto w-56" />
          <p className="mt-1 text-xs font-bold tracking-[0.2em] text-vinho">FICHAS TÉCNICAS</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <FormularioLogin proximo={typeof proximo === "string" ? proximo : ""} />
        </div>
      </div>
    </main>
  );
}
