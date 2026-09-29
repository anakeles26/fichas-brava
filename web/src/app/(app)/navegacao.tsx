"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Menu no mesmo formato do FichaHOST: lateral escura com logo, saudação e itens agrupados.
// No computador fica fixo à esquerda; no celular vira gaveta aberta pelo botão ☰.

type Item = { href: string; rotulo: string; icone: React.ReactNode };

const ICONE = "size-5 shrink-0";
const GRUPOS: { titulo: string | null; itens: Item[] }[] = [
  {
    titulo: null,
    itens: [
      {
        href: "/",
        rotulo: "Dashboard",
        icone: (
          <svg viewBox="0 0 24 24" fill="currentColor" className={ICONE} aria-hidden>
            <path d="M3 3h8v8H3zm10 0h8v5h-8zM3 13h8v8H3zm10-3h8v11h-8z" />
          </svg>
        ),
      },
    ],
  },
  {
    titulo: "Cozinha",
    itens: [
      {
        href: "/fichas",
        rotulo: "Fichas Técnicas",
        icone: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICONE} aria-hidden>
            <path d="M6 2h9l5 5v15H6z" />
            <path d="M9 12h8M9 16h8M9 8h4" />
          </svg>
        ),
      },
    ],
  },
];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

type Props = { nome: string; sair: () => Promise<void> };

export function Navegacao({ nome, sair }: Props) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  const conteudo = (
    <div className="flex h-full flex-col gap-6 px-4 py-6">
      <Link href="/" onClick={() => setAberto(false)} className="rounded-xl bg-white px-4 py-2 shadow" aria-label="Início">
        <Image src="/logo-brava.png" alt="Brava Wine" width={747} height={285} priority className="mx-auto h-auto w-40" />
        <span className="mt-0.5 block text-center text-[0.65rem] font-bold tracking-[0.2em] text-vinho">FICHAS</span>
      </Link>

      <p className="px-2 text-base">
        Olá, <strong>{nome}</strong>
      </p>

      <nav className="flex flex-1 flex-col gap-5" aria-label="Menu principal">
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo ?? "inicio"} className="flex flex-col gap-1">
            {grupo.titulo && <p className="px-2 pb-1 text-sm font-semibold text-white/90">{grupo.titulo}</p>}
            {grupo.itens.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setAberto(false)}
                aria-current={ativo(pathname, item.href) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[0.95rem] transition ${
                  ativo(pathname, item.href) ? "bg-white/15 font-semibold" : "text-white/85 hover:bg-white/10"
                }`}
              >
                {item.icone}
                {item.rotulo}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-white/15 pt-4 text-sm">
        <Link
          href="/conta/senha"
          onClick={() => setAberto(false)}
          className={`rounded-lg px-3 py-2 ${ativo(pathname, "/conta/senha") ? "bg-white/15 font-semibold" : "text-white/85 hover:bg-white/10"}`}
        >
          Trocar senha
        </Link>
        <form action={sair}>
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-white/85 hover:bg-white/10">
            Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Computador: lateral fixa */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 overflow-y-auto bg-vinho-escuro text-white md:block">
        {conteudo}
      </aside>

      {/* Celular: barra no topo + gaveta */}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-vinho-escuro px-4 py-2 text-white md:hidden">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={aberto}
          className="rounded-lg p-2 text-2xl leading-none hover:bg-white/10"
        >
          ☰
        </button>
        <Link href="/" className="rounded-lg bg-white px-2 py-1" aria-label="Início">
          <Image src="/logo-brava.png" alt="Brava Wine" width={747} height={285} className="h-7 w-auto" />
        </Link>
      </header>
      {aberto && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" onClick={() => setAberto(false)} className="absolute inset-0 bg-black/50" />
          <aside className="relative h-full w-72 overflow-y-auto bg-vinho-escuro text-white shadow-xl">{conteudo}</aside>
        </div>
      )}
    </>
  );
}
