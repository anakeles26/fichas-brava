// Mesma regra do app Streamlit (src/fichabase/senha.py): 6+ caracteres, com pelo menos
// uma letra e um número ou caractere especial.
export function senhaValida(senha: string): boolean {
  return senha.length >= 6 && /\p{L}/u.test(senha) && /[^\p{L}]/u.test(senha);
}

export const REGRA_SENHA = "Mínimo 6 caracteres, com pelo menos 1 letra e 1 número ou caractere especial.";

/** Senha provisória legível, como a do script de migração (Brava-XXXXXXXX). */
export function gerarSenhaProvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const sorteio = crypto.getRandomValues(new Uint32Array(8));
  return "Brava-" + Array.from(sorteio, (n) => alfabeto[n % alfabeto.length]).join("");
}
