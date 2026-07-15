/**
 * Sincroniza el programType del paciente al localStorage del navegador para
 * que componentes cliente que están profundo en el árbol (WorkoutTimer,
 * etc.) puedan saber si el atleta es ADVANCE sin plumbing de props por
 * media docena de componentes.
 *
 * Se llama desde los home components (PatientHomeDark, PatientHomeRolling,
 * PatientHomePrevention) — que son los primeros clientes que reciben el
 * programType del server.
 */

const KEY = "fisio-patient-program-type";

export function writeCachedProgramType(programType: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (programType) localStorage.setItem(KEY, programType);
    else localStorage.removeItem(KEY);
  } catch { /* noop */ }
}

export function readCachedProgramType(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(KEY); } catch { return null; }
}
