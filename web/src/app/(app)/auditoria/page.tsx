import type { Metadata } from "next";
import { listarAuditoria, ROTULO_ENTIDADE } from "@/lib/auditoria";
import { ESTILO } from "@/components/visual";
import { perfilLogado } from "@/lib/sessao";

export const metadata: Metadata = { title: "Auditoria e Logs" };

const FORMATO = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PaginaAuditoria() {
  const perfil = await perfilLogado();
  if (!perfil?.gestao) return <p className="text-gray-600">Você não tem permissão para acessar Auditoria e Logs.</p>;

  const registros = await listarAuditoria();
  return (
    <>
      <h1 className="text-3xl leading-tight font-bold md:text-[44px]">Auditoria e Logs — {perfil.empresa}</h1>
      <p className="mb-6 text-sm text-gray-500">Quem fez o quê: os 200 registros mais recentes.</p>
      {registros.length === 0 && <p className="text-sm text-gray-500">Nenhum registro de auditoria ainda.</p>}
      <div className="flex flex-col gap-2">
        {registros.map((r) => (
          <div key={r.id} className={`${ESTILO.cartao} p-3`}>
            <p>
              <strong>{r.acao.charAt(0).toUpperCase() + r.acao.slice(1)}</strong> {ROTULO_ENTIDADE[r.entidade] ?? r.entidade} — {r.descricao}
            </p>
            <p className="text-sm text-gray-500">
              {r.quem} · {FORMATO.format(new Date(r.criadoEm))}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
