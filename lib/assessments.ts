export type AssessmentTest = { id: string; name: string; instructions: string; videoUrl: string };
export type Assessment = { instructions: string; tests: AssessmentTest[] };
export const MAX_ASSESSMENT_BYTES = 1024 * 1024 * 1024;
export const ASSESSMENT_MIMES = ["video/mp4", "video/quicktime", "video/webm"];
export function parseAssessment(raw: unknown): Assessment {
  try {
    const a = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { instructions: typeof a?.instructions === "string" ? a.instructions : "", tests: Array.isArray(a?.tests) ? a.tests : [] };
  } catch { return { instructions: "", tests: [] }; }
}
export function validateAssessment(raw: unknown): Assessment {
  const a = parseAssessment(raw);
  if (a.instructions.length > 10000 || a.tests.length > 30) throw new Error("Máximo 30 test por valoración.");
  const ids = new Set<string>();
  for (const t of a.tests) {
    if (!t || typeof t.id !== "string" || !/^[\w-]{1,100}$/.test(t.id) || ids.has(t.id)) throw new Error("Identificador de test no válido.");
    ids.add(t.id);
    if (typeof t.name !== "string" || !t.name.trim() || t.name.length > 200 || typeof t.instructions !== "string" || t.instructions.length > 10000 || typeof t.videoUrl !== "string" || t.videoUrl.length > 2000) throw new Error("Revisa el nombre y las instrucciones de cada test.");
    if (t.videoUrl) {
      const u = new URL(t.videoUrl);
      if (u.protocol !== "https:") throw new Error("El vídeo de ejemplo debe usar un enlace HTTPS.");
    }
  }
  return a;
}
export function assessmentTestFromSnapshot(snapshot: string, taskId: string, testId: string) {
  const tasks = JSON.parse(snapshot);
  const task = Array.isArray(tasks) && tasks.find((t: any) => t.id === taskId && t.type === "ASSESSMENT");
  if (!task) throw new Error("La subida solo está disponible en una valoración asignada.");
  const test = validateAssessment(task.assessment).tests.find(t => t.id === testId);
  if (!test) throw new Error("Este test no está asignado.");
  return { task, test };
}
