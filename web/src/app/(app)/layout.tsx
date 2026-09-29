import Image from "next/image";
import Link from "next/link";
import { perfilLogado } from "@/lib/sessao";
import { sair } from "./acoes";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await perfilLogado();

  return (
    <>
      <header className="sticky top-0 z-10 bg-vinho-escuro text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link href="/fichas" className="flex items-center gap-2 rounded-lg bg-white px-2 py-1" aria-label="Início">
            <Image src="/logo-brava.png" alt="Brava Wine" width={747} height={285} className="h-7 w-auto" priority />
          </Link>
          <nav className="flex flex-1 items-center gap-1 text-sm">
            <Link href="/fichas" className="rounded-md px-3 py-1.5 hover:bg-white/10">
              Fichas
            </Link>
          </nav>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm hover:bg-white/10">
              {perfil?.nome ?? "Conta"} ▾
            </summary>
            <div className="absolute right-0 mt-1 w-44 overflow-hidden rounded-lg bg-white text-sm text-gray-800 shadow-lg">
              <Link href="/conta/senha" className="block px-4 py-2.5 hover:bg-vinho-claro">
                Trocar senha
              </Link>
              <form action={sair}>
                <button type="submit" className="w-full px-4 py-2.5 text-left hover:bg-vinho-claro">
                  Sair
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {perfil ? (
          children
        ) : (
          <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow">
            <h1 className="text-lg font-semibold">Acesso desativado</h1>
            <p className="mt-2 text-gray-600">Seu login não está liberado para ver as fichas. Fale com a gestão.</p>
          </div>
        )}
      </main>
    </>
  );
}
