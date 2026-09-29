import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { configSupabase } from "@/lib/supabase/config";

// Roda antes de cada página: renova a sessão do Supabase (o token expira) e manda para
// o login quem não está logado, guardando a página de origem em ?proximo=.
// Não é a barreira de segurança dos dados (essa é a RLS do banco) — só a navegação.
export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  const { url, chave } = configSupabase();

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
      },
    },
  });

  // getUser valida o token no Supabase (não confia só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const paginaPublica = pathname === "/login";

  if (!user && !paginaPublica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    if (pathname !== "/") destino.searchParams.set("proximo", pathname + search);
    return redirecionar(destino, resposta);
  }
  if (user && paginaPublica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return redirecionar(destino, resposta);
  }
  return resposta;
}

// Redireciona levando junto os cookies de sessão renovados.
function redirecionar(destino: URL, resposta: NextResponse) {
  const redirect = NextResponse.redirect(destino);
  for (const cookie of resposta.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // Tudo, menos arquivos estáticos e imagens.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
