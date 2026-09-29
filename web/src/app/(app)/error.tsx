"use client";

// Falha ao falar com o Supabase (rede, instabilidade): mensagem simples e botão para
// tentar de novo, em vez da tela de erro padrão.
export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow">
      <h1 className="text-lg font-semibold">Não foi possível carregar</h1>
      <p className="mt-2 text-gray-600">Verifique a conexão e tente novamente.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-vinho px-4 py-2 font-semibold text-white hover:bg-vinho-hover"
      >
        Tentar novamente
      </button>
    </div>
  );
}
