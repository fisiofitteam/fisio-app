import { prisma } from "@/lib/prisma";
export type WeekExtras = {
  wods: Array<{ id: string; date: string; workout: string; notes: string | null; painScore: number | null; rpe: number | null }>;
  forms: Array<{ id: string; date: string; title: string; answers: Array<{ question: string; answer: string }> }>;
  evidence: Array<{ id: string; date: string; name: string; kind: string; notes: string | null; url: string | null }>;
};
function parse(value: unknown, fallback: any): any {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
function answersFor(questions: any, answers: any) {
  const qs = parse(questions, []);
  const a = parse(answers, {});
  if (!a || typeof a !== "object") return [];
  return Object.entries(a).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([key, value]) => ({
    question: String(Array.isArray(qs) ? qs.find(q => q.id === key)?.text || key : key),
    answer: typeof value === "string" ? value : JSON.stringify(value),
  }));
}
export async function collectWeekExtras(patientId: string, start: Date, end: Date): Promise<WeekExtras> {
  const [wods, callForms, sessions, evidence, assessments] = await Promise.all([
    prisma.wodLog.findMany({ where: { patientId, OR: [
      { completedAt: { gte: start, lt: end } }, { completedAt: null, submittedAt: { gte: start, lt: end } },
    ] }, orderBy: { submittedAt: "asc" } }),
    prisma.patientCallFormResponse.findMany({ where: { patientId, submittedAt: { gte: start, lt: end } }, orderBy: { submittedAt: "asc" } }),
    prisma.programSession.findMany({ where: { assignment: { patientId }, completedAt: { gte: start, lt: end }, responses: { not: null } },
      select: { id: true, completedAt: true, tasksSnapshot: true, responses: true } }),
    prisma.patientEvidence.findMany({ where: { patientId, status: "ready", kind: { not: "whatsapp" }, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, name: true, kind: true, notes: true, url: true } }),
    prisma.assessmentVideo.findMany({ where: { patientId, url: { not: null }, uploadedAt: { gte: start, lt: end } }, orderBy: { uploadedAt: "asc" } }),
  ]);
  const forms: WeekExtras["forms"] = callForms.map(f => {
    const snapshot = parse(f.formSnapshot, {});
    return { id: f.id, date: f.submittedAt.toISOString(), title: snapshot.name || "Formulario de seguimiento", answers: answersFor(snapshot.questions, f.answers) };
  });
  for (const s of sessions) {
    const tasks = parse(s.tasksSnapshot, []);
    const responses = parse(s.responses, {});
    if (!Array.isArray(tasks)) continue;
    for (const task of tasks) {
      if (task.type !== "FORM" || !responses?.[task.id]) continue;
      forms.push({ id: s.id + ":" + task.id, date: s.completedAt!.toISOString(), title: task.title || "Formulario de sesión", answers: answersFor(task.questions, responses[task.id]) });
    }
  }
  return {
    wods: wods.map(w => ({ id: w.id, date: (w.completedAt || w.submittedAt).toISOString(), workout: w.rawText, notes: w.notes, painScore: w.painScore, rpe: w.rpe })),
    forms,
    evidence: [...evidence.map(e => ({ id: e.id, date: e.createdAt.toISOString(), name: e.name, kind: e.kind, notes: e.notes, url: e.url })), ...assessments.map(a => ({ id: a.id, date: a.uploadedAt!.toISOString(), name: "Valoración: " + a.assessmentTitle + " · " + a.testTitle, kind: "video", notes: a.coachNotes || null, url: "/api/assessments/media?id=" + a.id + "&v=" + a.uploadedAt!.getTime() }))],
  };
}
export function extrasInWeek(all: WeekExtras, start: Date): WeekExtras {
  const from = start.getTime(), to = from + 7 * 86400000;
  const within = (row: { date: string }) => { const t = new Date(row.date).getTime(); return t >= from && t < to; };
  return { wods: all.wods.filter(within), forms: all.forms.filter(within), evidence: all.evidence.filter(within) };
}
