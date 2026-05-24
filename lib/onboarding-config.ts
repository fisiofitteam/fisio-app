// Lectura/validación de la configuración del onboarding guardada en BD
// (modelo OnboardingConfig, fila única). Si no existe, cae a los valores por
// defecto definidos en lib/onboarding-content.ts. Solo servidor (usa prisma).
import { prisma } from "@/lib/prisma";
import {
  ANAMNESIS_STEPS,
  CONTRACT_TEXT,
  CONTRACT_VERSION,
  type AnamnesisField,
  type AnamnesisFieldType,
  type AnamnesisStep,
} from "@/lib/onboarding-content";

const FIELD_TYPES: AnamnesisFieldType[] = [
  "text",
  "textarea",
  "number",
  "select",
  "radio",
  "scale",
  "date",
];

// Convierte una estructura desconocida (de BD o del editor) en AnamnesisStep[]
// saneado: descarta pasos/campos inválidos y normaliza tipos.
export function normalizeSteps(raw: unknown): AnamnesisStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: AnamnesisStep[] = [];
  const usedKeys = new Set<string>();

  raw.forEach((s: any, si: number) => {
    if (!s || typeof s !== "object") return;
    const fields: AnamnesisField[] = [];
    const rawFields = Array.isArray(s.fields) ? s.fields : [];
    rawFields.forEach((f: any, fi: number) => {
      if (!f || typeof f !== "object") return;
      const type: AnamnesisFieldType = FIELD_TYPES.includes(f.type) ? f.type : "text";
      let key = typeof f.key === "string" && f.key.trim() ? f.key.trim() : `f_${si}_${fi}`;
      // Garantiza unicidad de claves
      while (usedKeys.has(key)) key = `${key}_`;
      usedKeys.add(key);
      const label = typeof f.label === "string" ? f.label : "";
      if (!label.trim()) return; // un campo sin etiqueta no aporta
      const field: AnamnesisField = { key, label, type };
      if (f.required === true) field.required = true;
      if (typeof f.placeholder === "string" && f.placeholder) field.placeholder = f.placeholder;
      if (typeof f.help === "string" && f.help) field.help = f.help;
      if ((type === "select" || type === "radio") && Array.isArray(f.options)) {
        const opts = f.options.map((o: any) => String(o)).filter((o: string) => o.trim());
        if (opts.length) field.options = opts;
      }
      fields.push(field);
    });
    const title = typeof s.title === "string" ? s.title : "";
    if (!title.trim() && fields.length === 0) return; // paso vacío
    const step: AnamnesisStep = {
      id: typeof s.id === "string" && s.id.trim() ? s.id.trim() : `step_${si}`,
      title: title || `Paso ${si + 1}`,
      fields,
    };
    if (typeof s.description === "string" && s.description) step.description = s.description;
    steps.push(step);
  });

  return steps;
}

export type ResolvedOnboardingConfig = {
  anamnesisSteps: AnamnesisStep[];
  contractText: string;
  contractVersion: string;
};

// Lee la config efectiva del onboarding (BD o defaults).
export async function getOnboardingConfig(): Promise<ResolvedOnboardingConfig> {
  const row = await prisma.onboardingConfig.findUnique({ where: { id: "singleton" } });
  if (!row) {
    return {
      anamnesisSteps: ANAMNESIS_STEPS,
      contractText: CONTRACT_TEXT,
      contractVersion: CONTRACT_VERSION,
    };
  }
  let steps: AnamnesisStep[] = [];
  try {
    steps = normalizeSteps(JSON.parse(row.anamnesisSteps));
  } catch {
    steps = [];
  }
  // Si por lo que sea quedó vacío, usa los defaults para no romper el onboarding
  if (steps.length === 0) steps = ANAMNESIS_STEPS;
  return {
    anamnesisSteps: steps,
    contractText: row.contractText || CONTRACT_TEXT,
    contractVersion: row.contractVersion || CONTRACT_VERSION,
  };
}
