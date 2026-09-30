import type { Metadata } from "next";
import Link from "next/link";
import { ESTILO } from "@/components/visual";
import { listarAcessos } from "@/lib/acessos";
import { PAPEIS } from "@/lib/papeis";
import { perfilLogado } from "@/lib/sessao";

export const metadata: Metadata = { title: "Log de acessos" };

const PERIODOS = [7, 30, 90] as const;
const FORMATO = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PaginaAcessos({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const perfil = await perfilLogado();
  if (!perfil?.gestao) return <p className="text-gray-600">Você não tem permissão para acessar o Log de acessos.</p>;

  const pedido = Number((await searchParams).dias);
  const dias = PERIODOS.find((d) => d === pedido) ?? 30;
  const { historico, resumo } = await listarAcessos(dias);

  return (
    <>
      <h1 className="text-3xl leading-tight font-bold md:text-[44px]">Log de acessos</h1>
      <p className="mb-4 text-sm text-gray-500">
        Quem entrou no sistema e quando — um registro por login. O histórico começa na data em que esta tela entrou no ar.
      </p>

      <nav className="mb-6 flex gap-2" aria-label="Período">
        {PERIODOS.map((d) => (
          <Link key={d} href={`/acessos?dias=${d}`} className={d === dias ? ESTILO.botaoPrimario : ESTILO.botaoSecundario}>
            Últimos {d} dias
          </Link>
        ))}
      </nav>

      <h2 className="mb-2 text-xl font-semibold">Por usuário</h2>
      <div className="mb-8 flex flex-col gap-2">
        {resumo.map((u) => (
          <div key={u.id} className={`${ESTILO.cartao} flex flex-wrap items-center gap-x-4 gap-y-1 p-3`}>
            <strong className="min-w-40 flex-1">
              {u.nome}
              {!u.ativo && <span className="ml-2 text-sm font-normal text-gray-500">(inativo)</span>}
            </strong>
            <span className="text-sm text-gray-600">{PAPEIS[u.papel]}</span>
            <span className="text-sm text-gray-600">{u.entradas} acesso(s)</span>
            <span className="text-sm text-gray-500">{u.ultimo ? `Último: ${FORMATO.format(new Date(u.ultimo))}` : "Sem acesso no período"}</span>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-xl font-semibold">Histórico</h2>
      {historico.length === 0 && <p className="text-sm text-gray-500">Nenhum acesso registrado no período.</p>}
      <div className="flex flex-col gap-1">
        {historico.map((a) => (
          <p key={a.id} className="text-sm">
            <strong>{a.nome}</strong> <span className="text-gray-500">· {PAPEIS[a.papel]} · {FORMATO.format(new Date(a.em))}</span>
          </p>
        ))}
      </div>
    </>
  );
}
