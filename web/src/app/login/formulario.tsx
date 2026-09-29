"use client";

import { useActionState } from "react";
import { type EstadoLogin, entrar } from "./acoes";

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, { erro: null });

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="proximo" value={proximo} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-vinho focus:ring-2 focus:ring-vinho-claro"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Senha
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-vinho focus:ring-2 focus:ring-vinho-claro"
        />
      </label>
      {estado.erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-vinho px-4 py-2.5 font-semibold text-white hover:bg-vinho-hover disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
