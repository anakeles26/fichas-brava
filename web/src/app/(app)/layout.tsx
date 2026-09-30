import { perfilLogado } from "@/lib/sessao";
import { sair } from "./acoes";
import { Navegacao } from "./navegacao";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await perfilLogado();

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <Navegacao nome={perfil?.nome ?? "—"} empresa={perfil?.empresa ?? ""} gestao={perfil?.papel === "gestao"} sair={sair} />
      {/* Espaçamento do conteúdo igual ao do Streamlit: 96 px em cima, 80 px dos lados. */}
      <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-10 md:px-20 md:pt-24 md:pb-16">
        {perfil ? (
          children
        ) : (
          <div className="mx-auto max-w-md rounded-lg border border-gray-200 p-6 text-center">
            <h1 className="text-lg font-semibold">Acesso desativado</h1>
            <p className="mt-2 text-gray-600">Seu login não está liberado para ver as fichas. Fale com a gestão.</p>
          </div>
        )}
      </main>
    </div>
  );
}
