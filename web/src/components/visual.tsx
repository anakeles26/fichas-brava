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
