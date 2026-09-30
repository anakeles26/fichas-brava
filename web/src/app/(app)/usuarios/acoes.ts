"use server";

import { revalidatePath } from "next/cache";
import { gerarSenhaProvisoria, REGRA_SENHA, senhaValida } from "@/lib/senha";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { PAPEIS, papelValido, podeGerenciar, type Papel } from "@/lib/papeis";
import { gestorLogado, registrarUsuario } from "@/lib/usuarios";

export type ResultadoUsuario = { erro: string | null; ok: string | null; senha?: string };

const SOMENTE_GESTAO = "Você não tem permissão para gerenciar usuários.";
const SEM_HIERARQUIA = "Você não pode gerenciar alguém com função acima da sua.";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Login desativado não consegue entrar nem renovar a sessão (vale ~100 anos).
const BANIDO = "876000h";

/** O alvo precisa ser da casa do gestor (a RLS já esconde as outras, mas a chave secreta ignora a RLS). */
async function alvoDaCasa(id: string, empresaId: number) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("perfis").select("id, nome, papel, ativo").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  return data as { id: string; nome: string; papel: Papel; ativo: boolean } | null;
}

export async function criarUsuario(_anterior: ResultadoUsuario, dados: FormData): Promise<ResultadoUsuario> {
  const gestor = await gestorLogado();
  if (!gestor) return { erro: SOMENTE_GESTAO, ok: null };

  const nome = String(dados.get("nome") ?? "").trim();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const papel = dados.get("papel");
  const manual = dados.get("senha_manual") === "on";
  const senhaInformada = String(dados.get("senha") ?? "");
  const confirmacao = String(dados.get("confirmacao") ?? "");

  if (!nome) return { erro: "Informe o nome.", ok: null };
  if (!EMAIL.test(email)) return { erro: "Informe um e-mail válido.", ok: null };
  if (!papelValido(papel)) return { erro: "Escolha a função.", ok: null };
  if (!podeGerenciar(gestor.papel, papel)) return { erro: SEM_HIERARQUIA, ok: null };
  if (manual) {
    if (senhaInformada !== confirmacao) return { erro: "As senhas não coincidem.", ok: null };
    if (!senhaValida(senhaInformada)) return { erro: `Senha fraca. ${REGRA_SENHA}`, ok: null };
  }
  const senha = manual ? senhaInformada : gerarSenhaProvisoria();

  const admin = criarClienteAdmin();
  const { data: criado, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !criado.user) {
    const jaExiste = error?.code === "email_exists" || /already|exist/i.test(error?.message ?? "");
    return { erro: jaExiste ? "Já existe um usuário com esse e-mail." : "Não foi possível criar o login. Tente novamente.", ok: null };
  }

  const { error: erroPerfil } = await admin
    .from("perfis")
    .insert({ id: criado.user.id, empresa_id: gestor.empresaId, nome, papel });
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id); // não deixa login órfão
    return { erro: "Não foi possível criar o perfil. Tente novamente.", ok: null };
  }

  await registrarUsuario(gestor, "criar", `Usuário '${nome}' <${email}> (${PAPEIS[papel]})`);
  revalidatePath("/usuarios");
  return {
    erro: null,
    ok: `Usuário "${nome}" criado.`,
    // Só mostramos a senha quando foi gerada aqui: é a única vez que ela aparece.
    senha: manual ? undefined : senha,
  };
}

export async function alterarFuncao(id: string, papel: string): Promise<ResultadoUsuario> {
  const gestor = await gestorLogado();
  if (!gestor) return { erro: SOMENTE_GESTAO, ok: null };
  if (!papelValido(papel)) return { erro: "Função inválida.", ok: null };
  if (id === gestor.id) return { erro: "Você não pode alterar a função da própria conta.", ok: null };
  const alvo = await alvoDaCasa(id, gestor.empresaId);
  if (!alvo) return { erro: "Usuário não encontrado.", ok: null };
  if (!podeGerenciar(gestor.papel, alvo.papel) || !podeGerenciar(gestor.papel, papel)) return { erro: SEM_HIERARQUIA, ok: null };

  const { error } = await criarClienteAdmin().from("perfis").update({ papel }).eq("id", id).eq("empresa_id", gestor.empresaId);
  if (error) return { erro: "Não foi possível alterar a função.", ok: null };
  await registrarUsuario(gestor, "editar", `Usuário '${alvo.nome}': função ${PAPEIS[alvo.papel]} → ${PAPEIS[papel]}`);
  revalidatePath("/usuarios");
  return { erro: null, ok: "Função atualizada." };
}

export async function definirSenha(id: string, nova: string, confirmacao: string): Promise<ResultadoUsuario> {
  const gestor = await gestorLogado();
  if (!gestor) return { erro: SOMENTE_GESTAO, ok: null };
  if (nova !== confirmacao) return { erro: "As senhas não coincidem.", ok: null };
  if (!senhaValida(nova)) return { erro: `Senha fraca. ${REGRA_SENHA}`, ok: null };
  const alvo = await alvoDaCasa(id, gestor.empresaId);
  if (!alvo) return { erro: "Usuário não encontrado.", ok: null };
  if (id !== gestor.id && !podeGerenciar(gestor.papel, alvo.papel)) return { erro: SEM_HIERARQUIA, ok: null };

  const { error } = await criarClienteAdmin().auth.admin.updateUserById(id, { password: nova });
  if (error) return { erro: "Não foi possível trocar a senha.", ok: null };
  await registrarUsuario(gestor, "editar", `Usuário '${alvo.nome}': senha redefinida`);
  return { erro: null, ok: "Senha atualizada." };
}

export async function mudarAtivo(id: string, ativo: boolean): Promise<ResultadoUsuario> {
  const gestor = await gestorLogado();
  if (!gestor) return { erro: SOMENTE_GESTAO, ok: null };
  if (id === gestor.id) return { erro: "Você não pode desativar a própria conta.", ok: null };
  const alvo = await alvoDaCasa(id, gestor.empresaId);
  if (!alvo) return { erro: "Usuário não encontrado.", ok: null };
  if (!podeGerenciar(gestor.papel, alvo.papel)) return { erro: SEM_HIERARQUIA, ok: null };

  const admin = criarClienteAdmin();
  const { error } = await admin.from("perfis").update({ ativo }).eq("id", id).eq("empresa_id", gestor.empresaId);
  if (error) return { erro: "Não foi possível alterar o usuário.", ok: null };
  await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : BANIDO });
  await registrarUsuario(gestor, ativo ? "reativar" : "inativar", `Usuário '${alvo.nome}' ${ativo ? "reativado" : "desativado"}`);
  revalidatePath("/usuarios");
  return { erro: null, ok: ativo ? "Usuário reativado." : "Usuário desativado." };
}
