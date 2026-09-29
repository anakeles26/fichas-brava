/** Forma comparável de um texto para busca: sem acento, minúsculo e espaços simples. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Verdadeiro se todas as palavras da busca aparecem no nome ("polvo arroz" acha "Arroz de polvo"). */
export function combina(nome: string, busca: string): boolean {
  const alvo = normalizar(nome);
  return normalizar(busca)
    .split(" ")
    .filter(Boolean)
    .every((palavra) => alvo.includes(palavra));
}
