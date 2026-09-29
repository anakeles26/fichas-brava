# Fichas Brava — app web (Next.js)

Consulta das fichas técnicas da cozinha do Brava Wine. Publicado na Vercel
(Root Directory = `web`), com banco, login e regras de segurança no Supabase.

Design: `../docs/superpowers/specs/2026-09-29-fichas-brava-vercel-design.md`

## Rodar no computador

```bash
cp .env.example .env.local   # e preencha com a URL e a chave pública do Supabase
npm install
npm run dev                  # http://localhost:3000
```

## Testes

```bash
npm test          # regras de quantidade, unidades, sub-receitas e busca
npm run lint
npm run build
```

As regras de segurança do banco são testadas em `../supabase` (`npm test`).

## Publicação

Cada `git push` na branch `main` publica na Vercel. Variáveis de ambiente na Vercel:
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (chave pública).
A chave secreta do Supabase nunca entra neste app.

## Onde fica cada coisa

| Caminho | O que é |
|---|---|
| `src/proxy.ts` | Renova a sessão e manda para o login quem não entrou |
| `src/lib/fichas.ts` | Consultas ao Supabase (lista e ficha com sub-receitas) |
| `src/lib/quantidades.ts`, `composicao.ts`, `busca.ts` | Regras puras, com testes |
| `src/app/login` | Tela de login |
| `src/app/(app)/fichas` | Lista e ficha completa (multiplicador em `[id]/ingredientes.tsx`) |
| `src/app/(app)/conta/senha` | Trocar a própria senha |
