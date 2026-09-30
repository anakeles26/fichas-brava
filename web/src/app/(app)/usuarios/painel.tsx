"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso, Expansor, ESTILO, Icone, Selo } from "@/components/visual";
import { PAPEIS, type Papel } from "@/lib/papeis";
import type { Usuario } from "@/lib/usuarios";
import { alterarFuncao, criarUsuario, definirSenha, mudarAtivo, type ResultadoUsuario } from "./acoes";

const INICIAL: ResultadoUsuario = { erro: null, ok: null };
const REGRA = "Mínimo 6 caracteres, com pelo menos 1 letra e 1 número ou caractere especial.";

export function PainelUsuarios({ usuarios, permitidos }: { usuarios: Usuario[]; permitidos: Papel[] }) {
  const [aba, setAba] = useState<"ativos" | "inativos">("ativos");
  const ativos = usuarios.filter((u) => u.ativo);
  const inativos = usuarios.filter((u) => !u.ativo);
  const lista = aba === "ativos" ? ativos : inativos;

  return (
    <>
      <Expansor titulo="Novo usuário" icone="person_add">
        <NovoUsuario permitidos={permitidos} />
      </Expansor>

      <div className="mt-6 mb-4 flex gap-6 border-b border-gray-200" role="tablist">
        {(
          [
            ["ativos", `Ativos (${ativos.length})`],
            ["inativos", `Inativos (${inativos.length})`],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            onClick={() => setAba(chave)}
            className={`-mb-px border-b-2 pb-2 text-sm ${
              aba === chave ? "border-vinho font-semibold text-vinho" : "border-transparent text-gray-600 hover:text-vinho"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {lista.length === 0 && <p className="text-sm text-gray-500">Nenhum usuário {aba === "ativos" ? "ativo" : "inativo"}.</p>}
        {lista.map((u) => (
          <LinhaUsuario key={u.id} usuario={u} permitidos={permitidos} />
        ))}
      </div>
    </>
  );
}

function NovoUsuario({ permitidos }: { permitidos: Papel[] }) {
  const [estado, acao, enviando] = useActionState(criarUsuario, INICIAL);
  const [manual, setManual] = useState(false);
  return (
    // key: depois de criar, o formulário recomeça vazio (o aviso fica)
    <form action={acao} key={estado.ok ?? "novo"} className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">Adicione um novo membro à equipe do restaurante.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={ESTILO.rotulo}>
          Nome
          <input name="nome" required placeholder="Ex: João Silva" className={ESTILO.campo} />
        </label>
        <label className={ESTILO.rotulo}>
          Email
          <input name="email" type="email" required placeholder="joao@exemplo.com" className={ESTILO.campo} />
        </label>
      </div>
      <label className={ESTILO.rotulo}>
        Função
        <select name="papel" defaultValue={permitidos[permitidos.length - 1]} className={ESTILO.campo}>
          {permitidos.map((p) => (
            <option key={p} value={p}>
              {PAPEIS[p]}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">Admin master, Admin e Líder cadastram e editam; Usuário só consulta.</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="senha_manual" checked={manual} onChange={(e) => setManual(e.target.checked)} />
        Definir a senha agora (em vez de gerar automaticamente)
      </label>
      {manual ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className={ESTILO.rotulo}>
            Senha
            <input name="senha" type="password" autoComplete="new-password" className={ESTILO.campo} />
          </label>
          <label className={ESTILO.rotulo}>
            Confirmar senha
            <input name="confirmacao" type="password" autoComplete="new-password" className={ESTILO.campo} />
          </label>
          <p className="text-xs text-gray-500 md:col-span-2">{REGRA}</p>
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          A senha é gerada e mostrada aqui uma única vez — repasse para a pessoa, que pode trocá-la depois em “Trocar senha”.
        </p>
      )}
      <Aviso erro={estado.erro} ok={estado.ok} />
      {estado.senha && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          Senha provisória (não será mostrada de novo): <strong className="font-mono">{estado.senha}</strong>
        </p>
      )}
      <button type="submit" disabled={enviando} className={`${ESTILO.botaoPrimario} self-start`}>
        {enviando ? "Criando…" : "Criar usuário"}
      </button>
    </form>
  );
}

function LinhaUsuario({ usuario: u, permitidos }: { usuario: Usuario; permitidos: Papel[] }) {
  const gerencia = u.eu || permitidos.includes(u.papel);
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoUsuario>(INICIAL);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  function rodar(tarefa: () => Promise<ResultadoUsuario>, aoConcluir?: () => void) {
    iniciar(async () => {
      const r = await tarefa();
      setResultado(r);
      if (!r.erro) aoConcluir?.();
    });
  }

  return (
    <div className={`${ESTILO.cartao} flex flex-col gap-2 p-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <strong>{u.nome}</strong> {u.eu && <span className="text-sm text-gray-500">(você)</span>}
          <p className="truncate text-sm text-gray-500">{u.email}</p>
        </div>
        <Selo cor={u.papel === "usuario" ? "dourado" : "vinho"}>{PAPEIS[u.papel]}</Selo>
      </div>

      {gerencia && (
      <Expansor titulo="Editar" icone="edit">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-sm font-semibold">Definir nova senha</p>
            <div className="grid gap-3 md:grid-cols-2">
              <input type="password" autoComplete="new-password" placeholder="Nova senha" value={senha} onChange={(e) => setSenha(e.target.value)} className={ESTILO.campo} />
              <input type="password" autoComplete="new-password" placeholder="Confirmar nova senha" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className={ESTILO.campo} />
            </div>
            <p className="mt-1 text-xs text-gray-500">{REGRA}</p>
            <button
              type="button"
              disabled={pendente || !senha}
              onClick={() => rodar(() => definirSenha(u.id, senha, confirmacao), () => { setSenha(""); setConfirmacao(""); })}
              className={`${ESTILO.botaoSecundario} mt-2`}
            >
              <Icone nome="key" /> Salvar nova senha
            </button>
          </div>

          {u.eu ? (
            <p className="text-sm text-gray-500">Você não pode alterar a função nem desativar a própria conta.</p>
          ) : (
            <>
              <label className={ESTILO.rotulo}>
                Função
                <select
                  defaultValue={u.papel}
                  disabled={pendente}
                  onChange={(e) => rodar(() => alterarFuncao(u.id, e.target.value))}
                  className={`${ESTILO.campo} max-w-xs`}
                >
                  {permitidos.map((p) => (
                    <option key={p} value={p}>
                      {PAPEIS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => mudarAtivo(u.id, !u.ativo))}
                className={`${u.ativo ? ESTILO.botaoPerigo : ESTILO.botaoSecundario} self-start`}
              >
                <Icone nome={u.ativo ? "block" : "undo"} /> {u.ativo ? "Desativar usuário" : "Reativar usuário"}
              </button>
            </>
          )}
        </div>
      </Expansor>
      )}
      <Aviso {...resultado} />
    </div>
  );
}
