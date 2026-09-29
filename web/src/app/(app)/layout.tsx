import { perfilLogado } from "@/lib/sessao";
import { sair } from "./acoes";
import { Navegacao } from "./navegacao";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await perfilLogado();

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <Navegacao nome={perfil?.nome ?? "—"} sair={sair} />
      <main className="w-full flex-1 bg-white px-4 py-6 sm:px-8 md:py-10 lg:px-14">
        <div className="mx-auto max-w-6xl">
          {perfil ? (
            children
          ) : (
            <div className="mx-auto max-w-md rounded-2xl border border-gray-200 p-6 text-center">
              <h1 className="text-lg font-semibold">Acesso desativado</h1>
              <p className="mt-2 text-gray-600">Seu login não está liberado para ver as fichas. Fale com a gestão.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
