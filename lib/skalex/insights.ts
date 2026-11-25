/** Provider contract: https://zapp.skalex.pro/docs/api/datos (2026-11-25).
 * aiInsights.data is deliberately open-ended. Never invent missing answers. */
export type InsightField = { key: string; label: string; value: string };
export type SkalexCallContext = {
  status: "ready" | "unavailable";
  fields: InsightField[];
  reason: string | null;
  message: string;
  generatedAt: string | null;
  checkedAt: string;
  retryAt: string | null;
};
export type CallIdentity = {
  id: string; phone?: string | null; instagram?: string | null;
  contactType?: string | null; contactValue?: string | null;
};
export function normalizePhone(value?: string | null) {
  const result = (value || "").replace(/\D/g, "").replace(/^00/, "");
  return /^\d{7,15}$/.test(result) ? result : null;
}
export function normalizeInstagram(value?: string | null) {
  let result = (value || "").trim().toLowerCase();
  if (/^(https?:\/\/)?(www\.)?instagram\.com\//.test(result)) result = result.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//, "").split(/[/?#]/)[0];
  result = result.replace(/^@+/, "");
  return /^[a-z0-9_.]{1,30}$/.test(result) ? result : null;
}
export function callIdentity(lead: CallIdentity) {
  return {
    phone: normalizePhone(lead.phone) || (lead.contactType === "phone" ? normalizePhone(lead.contactValue) : null),
    instagram: normalizeInstagram(lead.instagram) || (lead.contactType === "instagram" ? normalizeInstagram(lead.contactValue) : null),
  };
}
const labels: Record<string, string> = {
  situacion_actual: "Situación actual", current_situation: "Situación actual", situacion_actual_del_lead: "Situación actual",
  dolor_principal: "Dolor principal", pain_point: "Dolor y motivación", punto_de_dolor: "Punto de dolor", pain_point_and_motivation: "Dolor y motivación",
  objetivo: "Objetivo", objetivos: "Objetivos", goal: "Objetivo", goals: "Objetivos",
  tratamientos_previos: "Qué ha probado", que_ha_probado: "Qué ha probado", previous_treatments: "Qué ha probado", attempted_solutions: "Qué ha probado",
  obstaculo_principal: "Obstáculo principal", main_obstacle: "Obstáculo principal",
  objecion: "Objeción", objeciones: "Objeciones", objections: "Objeciones", detected_objections: "Objeciones detectadas",
  nivel_de_interes: "Nivel de interés", nivel_interes: "Nivel de interés", interest_level: "Nivel de interés",
  closer_recommendation: "Preparación de la llamada", recommended_action: "Preparación de la llamada", next_step: "Siguiente paso",
};
function words(key: string) { return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim(); }
function label(key: string) {
  const plain = words(key), normalized = plain.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "_");
  return labels[normalized] || plain.charAt(0).toUpperCase() + plain.slice(1);
}
function valueText(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) return "";
  if (typeof value === "string") return value.trim().slice(0, 12000);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (Array.isArray(value)) return value.slice(0, 30).map(v => valueText(v, depth + 1)).filter(Boolean).map(v => "• " + v).join("\n").slice(0, 12000);
  if (typeof value === "object") return Object.entries(value).slice(0, 30).map(([k, v]) => { const text = valueText(v, depth + 1); return text ? label(k) + ": " + text : ""; }).filter(Boolean).join("\n").slice(0, 12000);
  return "";
}
export function insightFields(data: unknown): InsightField[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  let remaining = 100000;
  return Object.entries(data).slice(0, 40).flatMap(([key, value]) => {
    const text = valueText(value).slice(0, remaining); remaining -= text.length;
    return text && key.length <= 160 ? [{ key, label: label(key), value: text }] : [];
  });
}
const messages: Record<string, string> = {
  not_enough_messages: "Skalex todavía no tiene suficientes mensajes de esta persona para preparar el resumen.",
  generating: "Skalex está preparando el resumen. Vuelve a consultarlo en unos segundos.",
  daily_limit_reached: "Skalex ha alcanzado su límite diario de resúmenes nuevos. Se volverá a consultar mañana.",
  generation_failed: "Skalex no ha podido preparar el resumen. Puedes volver a intentarlo en unos minutos.",
  not_requested: "Skalex aún no ha preparado el resumen de esta conversación.",
  disabled: "El resumen de conversaciones está desactivado en Skalex.",
  not_found: "No se ha encontrado una conversación en Skalex con el teléfono o Instagram de esta persona.",
  missing_identity: "Añade el teléfono o usuario de Instagram del lead para consultar su conversación.",
  not_configured: "La conexión con Skalex no está configurada. El equipo administrador debe revisarla.",
  invalid_response: "Skalex no ha devuelto un resumen utilizable. Puedes volver a consultarlo más tarde.",
  timeout: "Skalex ha tardado demasiado en responder. Puedes volver a intentarlo en unos minutos.",
  connection_error: "No se ha podido consultar Skalex. Puedes volver a intentarlo en unos minutos.",
};
export function unavailableContext(reason: string, now = new Date()): SkalexCallContext {
  const delay = reason === "generating" ? 20000 : reason === "not_enough_messages" || reason === "not_found" ? 30 * 60000 : reason === "daily_limit_reached" || reason === "disabled" ? 24 * 3600000 : 2 * 60000;
  return { status: "unavailable", fields: [], reason, message: messages[reason] || messages.invalid_response, generatedAt: null, checkedAt: now.toISOString(), retryAt: new Date(now.getTime() + delay).toISOString() };
}
export function parseProviderInsights(value: unknown, now = new Date()): SkalexCallContext {
  if (!value || typeof value !== "object") return unavailableContext("invalid_response", now);
  const raw = value as Record<string, unknown>, fields = insightFields(raw.data);
  if (raw.available === true && fields.length) {
    const time = typeof raw.generatedAt === "string" ? new Date(raw.generatedAt) : null;
    return { status: "ready", fields, reason: null, message: "", generatedAt: time && !isNaN(time.getTime()) ? time.toISOString() : null, checkedAt: now.toISOString(), retryAt: null };
  }
  const result = unavailableContext(typeof raw.reason === "string" && raw.reason in messages ? raw.reason : "invalid_response", now);
  if (result.reason === "not_enough_messages" && Number.isSafeInteger(raw.customerMessages) && Number.isSafeInteger(raw.requiredMessages) && Number(raw.customerMessages) >= 0 && Number(raw.requiredMessages) > 0) result.message = `Skalex necesita más conversación: ${raw.customerMessages} de ${raw.requiredMessages} mensajes de la persona.`;
  return result;
}
export function readStoredContext(payload: string | null): SkalexCallContext | null {
  if (!payload) return null;
  try { const value = JSON.parse(payload); return ["ready", "unavailable"].includes(value.status) && Array.isArray(value.fields) && typeof value.checkedAt === "string" ? value : null; } catch { return null; }
}
