import Link from "next/link";

export default function FichaNaoEncontrada() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-gray-200 p-6 text-center">
      <h1 className="text-lg font-semibold">Ficha não encontrada</h1>
      <p className="mt-2 text-gray-600">Ela pode ter sido inativada ou o endereço está errado.</p>
      <Link href="/fichas" className="mt-4 inline-block rounded-lg bg-vinho px-4 py-2 font-semibold text-white hover:bg-vinho-hover">
        Ver todas as fichas
      </Link>
    </div>
  );
}
