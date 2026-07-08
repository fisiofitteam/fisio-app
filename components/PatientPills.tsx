// Constantes y etiquetas para Programa y Dificultad

export const PROGRAM_TYPES = ["RECUPERA", "CONSOLIDA", "ADVANCE", "PREVENTION"] as const;
export const DIFFICULTIES = ["FACIL", "MEDIO", "DIFICIL"] as const;

export const PROGRAM_LABELS: Record<string, { label: string; color: string }> = {
  RECUPERA: { label: "RECUPERA", color: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  CONSOLIDA: { label: "CONSOLIDA", color: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  ADVANCE: { label: "ADVANCE", color: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  PREVENTION: { label: "PREVENTION", color: "bg-amber-50 text-amber-800 border-amber-200" },
};

export const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  FACIL: { label: "FÁCIL", color: "bg-amber-100 text-amber-800 border-amber-200" },
  MEDIO: { label: "MEDIO", color: "bg-amber-100 text-amber-800 border-amber-200" },
  DIFICIL: { label: "DIFÍCIL", color: "bg-red-100 text-red-800 border-red-200" },
};

export function PatientPill({ value, kind }: { value: string | null; kind: "program" | "difficulty" }) {
  if (!value) return null;
  const meta = kind === "program" ? PROGRAM_LABELS[value] : DIFFICULTY_LABELS[value];
  if (!meta) return null;
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.color}`}>
      {meta.label}
    </span>
  );
}
