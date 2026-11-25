import { z } from "zod";

export const PUBLIC_WOD_VERSION = "hombro-v1-2026-11-25";
export const CONSENT_VERSION = "wod-hombro-2026-11-25";
export const WHATSAPP_NUMBER = "34621495367";
export const GROUPS = [
  { id: "overhead", name: "Por encima de la cabeza", examples: "Press, jerk, snatch, thruster, overhead squat" },
  { id: "pull", name: "Tirones y colgarte", examples: "Pull-ups, toes to bar, muscle-ups, remo" },
  { id: "push", name: "Empujes", examples: "Flexiones, fondos, burpees" },
  { id: "support", name: "Apoyos e invertidos", examples: "Planchas, handstand, HSPU" },
] as const;
export type Group = typeof GROUPS[number]["id"];
export const TOLERANCES = [
  { id: "comfortable", label: "Lo tolero bien" },
  { id: "dose", label: "Molesta con mucho peso o repeticiones" },
  { id: "pain", label: "También molesta al hacerlo suave" },
  { id: "unknown", label: "No lo hago / no lo sé" },
] as const;
export const SAFETY_FLAGS = [
  { id: "chest", label: "Dolor de hombro o brazo con presión en el pecho, falta de aire o sudor frío" },
  { id: "trauma", label: "Lesión o caída reciente sin valorar, deformidad o hinchazón importante" },
  { id: "sudden", label: "Dolor repentino intenso o incapacidad nueva para mover el brazo" },
  { id: "neuro", label: "Pérdida de sensibilidad, hormigueo persistente o pérdida nueva de fuerza" },
  { id: "fever", label: "Fiebre o malestar general junto con dolor de hombro" },
] as const;
export const EQUIPMENT = ["barbell", "dumbbell", "rings", "box", "bike"] as const;
export const EQUIPMENT_LABELS: Record<typeof EQUIPMENT[number], string> = { barbell: "Barra", dumbbell: "Mancuernas", rings: "Anillas", box: "Cajón / banco", bike: "Bici estática" };
const tolerance = z.enum(["comfortable", "dose", "pain", "unknown"]);
export const profileSchema = z.object({
  adult: z.literal(true),
  side: z.enum(["right", "left", "both"]),
  duration: z.enum(["under2w", "2w3m", "3m12m", "over1y"]),
  onset: z.enum(["gradual", "movement", "trauma", "unknown"]),
  timing: z.array(z.enum(["during", "after", "nextday", "rest"])).min(1).max(4),
  diagnosis: z.string().trim().max(600),
  restrictions: z.enum(["none", "yes", "unsure"]),
  restrictionNotes: z.string().trim().max(600),
  trainingDays: z.number().int().min(0).max(7),
  experience: z.enum(["new", "1to3", "over3"]),
  equipment: z.array(z.enum(EQUIPMENT)).max(5),
  goal: z.string().trim().min(3).max(400),
  tried: z.string().trim().max(600),
  intent: z.enum(["adapt", "help", "unsure"]),
  groups: z.object({ overhead: tolerance, pull: tolerance, push: tolerance, support: tolerance }),
  safetyFlags: z.array(z.enum(["chest", "trauma", "sudden", "neuro", "fever"])).max(5),
  safetyReviewed: z.literal(true),
}).strict();
export type ShoulderProfile = z.infer<typeof profileSchema>;
export const selfTestSchema = z.object({
  wallSlide: z.enum(["comfortable", "limited", "pain", "skip"]),
  rotation: z.enum(["comfortable", "limited", "pain", "skip"]),
  overheadSquat: z.enum(["comfortable", "limited", "pain", "skip"]),
  inclineHold: z.enum(["comfortable", "limited", "pain", "skip"]),
}).strict();
export type SelfTest = z.infer<typeof selfTestSchema>;
export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Introduce tu WhatsApp con prefijo internacional, por ejemplo +34600111222."),
  healthConsent: z.literal(true),
  marketingConsent: z.boolean(),
  profile: profileSchema,
  source: z.object({ source: z.string().max(100), medium: z.string().max(100), campaign: z.string().max(100) }).strict().optional(),
  website: z.string().max(0).optional(),
}).strict();
export const ALTERNATIVES = [
  { id: "air-squat", name: "Sentadilla sin carga", equipment: null, purpose: "Conservar el trabajo de piernas sin colocar una carga sobre la cabeza." },
  { id: "ring-row", name: "Remo en anillas con apoyo de pies", equipment: "rings", purpose: "Conservar un tirón con apoyo de pies, sin kipping ni suspensión completa." },
  { id: "incline-pushup", name: "Flexión inclinada en un banco estable", equipment: "box", purpose: "Conservar el empuje usando una posición que ya toleras." },
  { id: "bike", name: "Bici estática sin trabajo de brazos", equipment: "bike", purpose: "Mantener actividad cardiovascular sin repetir el gesto que molesta." },
  { id: "walk", name: "Caminar a ritmo cómodo", equipment: null, purpose: "Mantener actividad suave; cambia el estímulo del bloque original." },
] as const;
export type AlternativeId = typeof ALTERNATIVES[number]["id"];
export const adaptSchema = z.object({
  rawText: z.string().trim().min(3).max(6000).refine(text => text.split(/\n/).filter(s => s.trim()).length <= 60, "Divide el entrenamiento en bloques de hasta 60 líneas."),
  readiness: z.enum(["RED", "AMBER", "GREEN"]),
  painBefore: z.number().int().min(0).max(10),
  safetyToday: z.enum(["none", "new"]),
  confirmedText: z.literal(true),
  confirmedAlternatives: z.array(z.enum(["air-squat", "ring-row", "incline-pushup", "bike", "walk"])).max(5),
  requestId: z.string().uuid(),
  entryId: z.string().min(10).max(80).optional(),
}).strict();
export type AdaptInput = z.infer<typeof adaptSchema>;
export const feedbackSchema = z.object({
  entryId: z.string().min(10).max(80),
  response: z.enum(["better", "same", "worse", "not-done"]),
  nextDay: z.enum(["pending", "better", "same", "worse"]),
  effort: z.number().int().min(0).max(10).nullable(),
  painAfter: z.number().int().min(0).max(10).nullable(),
  painNextDay: z.number().int().min(0).max(10).nullable(),
  exercises: z.array(z.object({ key: z.string().max(80), performed: z.enum(["as-proposed", "changed", "skipped"]), hurt: z.boolean(), actual: z.string().trim().max(200) }).strict()).max(80),
  notes: z.string().trim().max(800),
}).strict().superRefine((data, ctx) => {
  if (data.response !== "not-done" && data.painAfter === null) ctx.addIssue({ code: "custom", path: ["painAfter"], message: "Indica el dolor posterior." });
  if (data.exercises.some(e => e.performed === "changed" && !e.actual)) ctx.addIssue({ code: "custom", path: ["exercises"], message: "Indica qué variante realizaste." });
});
export type Feedback = z.infer<typeof feedbackSchema>;
export type ResultLine = { key: string; movementId?: string; proposedMovementId?: string; level?: number; original: string; status: "context" | "keep" | "adjust" | "replace" | "confirm" | "review"; instruction: string; reason: string; alternatives?: AlternativeId[] };
export type WodResult = { version: string; gate: "none" | "review" | "urgent" | "emergency"; message: string; dailyAdvice: string; lines: ResultLine[] };
export type EntryDTO = { id: string; createdAt: string; rawText: string; readiness: string; painBefore: number; completedAt: string | null; result: WodResult; feedback: Feedback | null };
export type ProfileDTO = { id: string; name: string; phone: string; profile: ShoulderProfile; selfTest: SelfTest | null; marketingConsent: boolean; entries: EntryDTO[]; hasMore: boolean };
