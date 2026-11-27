export const CEO_IA_ROOT = "/fisio/ceo-ia";
export const ceoIaSections = [
  { href: CEO_IA_ROOT, label: "Resumen", founderOnly: false },
  { href: CEO_IA_ROOT + "/agentes", label: "Equipo IA", founderOnly: true },
  { href: CEO_IA_ROOT + "/encargos", label: "Encargos y consejo", founderOnly: true },
  { href: CEO_IA_ROOT + "/decisiones", label: "Decisiones", founderOnly: true },
  { href: CEO_IA_ROOT + "/memoria", label: "Memoria", founderOnly: true },
  { href: CEO_IA_ROOT + "/experimentos", label: "Experimentos", founderOnly: true },
  { href: CEO_IA_ROOT + "/finanzas", label: "Finanzas", founderOnly: true },
  { href: CEO_IA_ROOT + "/actividad", label: "Actividad y costes", founderOnly: true },
  { href: CEO_IA_ROOT + "/informes", label: "Informes", founderOnly: false },
  { href: CEO_IA_ROOT + "/comunicaciones", label: "Comunicaciones", founderOnly: true },
  { href: CEO_IA_ROOT + "/objetivos", label: "Objetivos y seguimiento", founderOnly: true },
  { href: CEO_IA_ROOT + "/semanal", label: "Estrategia semanal", founderOnly: true },
] as const;
export function ceoIaLegacyDestination(search: string, hash: string) {
  const report = new URLSearchParams(search).get("report");
  const query = report && /^grok-ceo-\d{4}-\d{2}-\d{2}$/.test(report)
    ? "?report=" + encodeURIComponent(report) : "";
  return CEO_IA_ROOT + (hash === "#buzon-ceo" ? "/comunicaciones" : "/informes") + query;
}
