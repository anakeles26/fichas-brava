"use client";

import { useActionState } from "react";
import { type EstadoSenha, trocarSenha } from "./acoes";

const CAMPO =
  "rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-vinho focus:ring-2 focus:ring-vinho-claro";

export function FormularioSenha() {
  const [estado, acao, enviando] = useActionState<EstadoSenha, FormData>(trocarSenha, { erro: null, ok: false });

  return (
    <form action={acao} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nova senha
        <input name="nova" type="password" autoComplete="new-password" required className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Confirmar nova senha
        <input name="confirmacao" type="password" autoComplete="new-password" required className={CAMPO} />
      </label>
      <p className="text-xs text-gray-500">Mínimo 6 caracteres, com pelo menos 1 letra e 1 número ou caractere especial.</p>
      {estado.erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Senha alterada com sucesso.
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-vinho px-4 py-2.5 font-semibold text-white hover:bg-vinho-hover disabled:opacity-60"
      >
        {enviando ? "Salvando…" : "Salvar senha"}
      </button>
    </form>
  );
}
