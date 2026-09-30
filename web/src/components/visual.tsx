// Peças visuais compartilhadas, iguais às do app Streamlit (src/fichabase/ui.py e
// telas/fichas.py): ícone Material, selo, desenho de utensílios e ícone de alérgeno.

import { normalizar } from "@/lib/busca";

export function Icone({ nome, className = "" }: { nome: string; className?: string }) {
  return (
    <span className={`icone ${className}`} aria-hidden>
      {nome}
    </span>
  );
}

type CorSelo = "vinho" | "dourado" | "verde" | "amarelo";

export function Selo({ cor, icone, children }: { cor: CorSelo; icone?: string; children: React.ReactNode }) {
  return (
    <span className={`selo selo-${cor}`}>
      {icone && <Icone nome={icone} />}
      {children}
    </span>
  );
}

/** Desenho de utensílios no lugar da foto (mesmo SVG do app antigo). */
export function SemFoto({ altura, children }: { altura: number; children?: React.ReactNode }) {
  return (
    <div className="relative flex items-center justify-center rounded-[10px] bg-placeholder" style={{ height: altura }}>
      <svg viewBox="0 0 220 100" className="w-[42%] max-w-[120px] opacity-35" aria-hidden>
        <rect x="21" y="8" width="6" height="52" rx="3" fill="#6B7280" />
        <ellipse cx="24" cy="78" rx="15" ry="20" fill="#6B7280" />
        <rect x="107" y="8" width="6" height="32" rx="3" fill="#6B7280" />
        <path d="M 96 40 C 90 65, 90 85, 110 95 C 130 85, 130 65, 124 40 Z" fill="none" stroke="#6B7280" strokeWidth="4" />
        <path d="M 103 40 C 99 62, 100 80, 110 90" fill="none" stroke="#6B7280" strokeWidth="3" />
        <path d="M 117 40 C 121 62, 120 80, 110 90" fill="none" stroke="#6B7280" strokeWidth="3" />
        <rect x="190" y="8" width="6" height="38" rx="3" fill="#6B7280" />
        <rect x="172" y="46" width="42" height="36" rx="9" fill="#6B7280" />
        <rect x="180" y="54" width="8" height="20" rx="3" fill="#F1F3F6" />
        <rect x="193" y="54" width="8" height="20" rx="3" fill="#F1F3F6" />
      </svg>
      {children}
    </div>
  );
}

// Classes dos controles do cadastro, iguais aos do Streamlit (botão primário vinho,
// secundário com borda, campo branco com foco vinho).
export const ESTILO = {
  botaoPrimario:
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-vinho px-4 py-2 text-sm font-semibold text-white hover:bg-vinho-hover disabled:opacity-50",
  botaoSecundario:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:border-vinho hover:text-vinho disabled:opacity-50",
  botaoPerigo:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#f5c2c0] bg-[#fdecec] px-4 py-2 text-sm text-[#b42318] hover:bg-[#fad7d5] disabled:opacity-50",
  campo:
    "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-vinho focus:ring-2 focus:ring-vinho-claro",
  rotulo: "flex flex-col gap-1 text-sm",
  cartao: "rounded-lg border border-black/20",
};

/** Bloco que abre e fecha (st.expander do Streamlit). */
export function Expansor({
  titulo,
  icone,
  aberto = false,
  children,
}: {
  titulo: string;
  icone?: string;
  aberto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={aberto} className="group rounded-lg border border-black/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm hover:text-vinho">
        {icone && <Icone nome={icone} />}
        <span className="flex-1">{titulo}</span>
        <Icone nome="expand_more" className="transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-black/10 px-4 py-4">{children}</div>
    </details>
  );
}

/** Mensagem de erro ou de sucesso depois de uma gravação. */
export function Aviso({ erro, ok }: { erro?: string | null; ok?: string | null }) {
  if (erro) {
    return (
      <p role="alert" className="rounded-lg bg-[#fdecec] px-3 py-2 text-sm text-[#b42318]">
        {erro}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-lg bg-[#dcf3e3] px-3 py-2 text-sm text-[#1e8449]">
        {ok}
      </p>
    );
  }
  return null;
}

// Ícone de cada alérgeno do catálogo (ICONES_ALERGENOS do app antigo).
const ICONES_ALERGENOS: Record<string, string> = {
  amendoas: "nutrition",
  amendoim: "eco",
  castanha: "avocado_bean",
  corante: "palette",
  crustaceos: "waves",
  gluten: "bakery_dining",
  lactose: "local_drink",
  leite: "water_full",
  ovo: "egg",
  peixe: "set_meal",
  soja: "psychiatry",
};

export function iconeAlergeno(nome: string): string {
  return ICONES_ALERGENOS[normalizar(nome)] ?? "warning";
}
