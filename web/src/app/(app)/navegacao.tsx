"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icone } from "@/components/visual";

// Menu lateral igual ao do app Streamlit: vinho escuro, logo num cartão branco com
// "FICHAS", saudação, casa, itens com ícone e "Sair" no pé. No celular vira gaveta (☰).

type Item = { href: string; rotulo: string; icone: string };

const ITENS: Item[] = [
  { href: "/", rotulo: "Dashboard", icone: "dashboard" },
  { href: "/fichas", rotulo: "Fichas Técnicas", icone: "receipt_long" },
  { href: "/insumos", rotulo: "Insumos", icone: "inventory_2" },
];

// Grupo "Configurações" do app antigo — só a gestão vê.
const CONFIGURACOES: Item[] = [{ href: "/categorias", rotulo: "Categorias", icone: "sell" }];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

type Props = { nome: string; empresa: string; gestao: boolean; sair: () => Promise<void> };

export function Navegacao({ nome, empresa, gestao, sair }: Props) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const fechar = () => setAberto(false);

  const conteudo = (
    <div className="flex min-h-full flex-col px-6 pt-12 pb-6 text-texto-lateral">
      <Link href="/" onClick={fechar} className="mx-2 block rounded-2xl bg-white px-5 pt-3 pb-2 shadow" aria-label="Início">
        <Image src="/logo-brava.png" alt="Brava Wine" width={747} height={285} priority className="mx-auto h-auto w-full max-w-44" />
        <span className="mt-1 block text-center text-[0.7rem] font-bold tracking-[0.2em] text-vinho">FICHAS</span>
      </Link>

      <p className="mt-3 px-2">
        Olá, <strong>{nome}</strong>
      </p>

      {empresa && (
        <div className="mt-4 px-2">
          <p className="mb-1 text-sm">Empresa</p>
          <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm text-gray-900">
            {empresa}
            <Icone nome="expand_more" className="text-gray-500" />
          </div>
        </div>
      )}

      <nav className="mt-6 flex flex-col gap-0.5" aria-label="Menu principal">
        {ITENS.map((item) => (
          <LinkMenu key={item.href} item={item} atual={ativo(pathname, item.href)} aoClicar={fechar} />
        ))}
        {gestao && (
          <>
            <p className="mt-4 mb-1 px-2 text-sm font-semibold">Configurações</p>
            {CONFIGURACOES.map((item) => (
              <LinkMenu key={item.href} item={item} atual={ativo(pathname, item.href)} aoClicar={fechar} />
            ))}
          </>
        )}
      </nav>

      <div className="mt-auto flex flex-col items-start gap-2 pt-10">
        <Link
          href="/conta/senha"
          onClick={fechar}
          className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm ${ativo(pathname, "/conta/senha") ? "bg-white/25 font-semibold" : "hover:bg-white/10"}`}
        >
          <Icone nome="key" />
          Trocar senha
        </Link>
        <form action={sair}>
          <button
            type="submit"
            className="rounded-lg border border-black/20 bg-vinho-botao px-3 py-1 hover:bg-vinho"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Computador: lateral fixa, 300 px como no app antigo */}
      <aside className="sticky top-0 hidden h-dvh w-[300px] shrink-0 overflow-y-auto bg-vinho-escuro md:block">{conteudo}</aside>

      {/* Celular: barra no topo + gaveta */}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-vinho-escuro px-4 py-2 text-white md:hidden">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={aberto}
          className="flex rounded-lg p-1.5 hover:bg-white/10"
        >
          <Icone nome="menu" className="text-2xl" />
        </button>
        <Link href="/" className="rounded-lg bg-white px-2 py-1" aria-label="Início">
          <Image src="/logo-brava.png" alt="Brava Wine" width={747} height={285} className="h-7 w-auto" />
        </Link>
      </header>
      {aberto && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" onClick={fechar} className="absolute inset-0 bg-black/50" />
          <aside className="relative h-full w-[300px] max-w-[85vw] overflow-y-auto bg-vinho-escuro shadow-xl">{conteudo}</aside>
        </div>
      )}
    </>
  );
}

function LinkMenu({ item, atual, aoClicar }: { item: Item; atual: boolean; aoClicar: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={aoClicar}
      aria-current={atual ? "page" : undefined}
      className={`flex h-8 items-center gap-2 rounded-md px-2 ${atual ? "bg-white/25 font-semibold" : "hover:bg-white/10"}`}
    >
      <Icone nome={item.icone} />
      {item.rotulo}
    </Link>
  );
}
