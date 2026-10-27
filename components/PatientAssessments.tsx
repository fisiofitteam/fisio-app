import { prisma } from "@/lib/prisma";
import { parseAssessment } from "@/lib/assessments";
import { AssessmentReview } from "@/components/AssessmentReview";
export async function PatientAssessments({ patientId }: { patientId: string }) {
  const [sessions, videos] = await Promise.all([
    prisma.programSession.findMany({ where: { assignment: { patientId }, tasksSnapshot: { contains: '"ASSESSMENT"' } }, orderBy: { scheduledDate: "desc" }, take: 100, select: { id: true, scheduledDate: true, tasksSnapshot: true } }),
    prisma.assessmentVideo.findMany({ where: { patientId }, orderBy: { assessedAt: "desc" }, take: 500 }),
  ]);
  const groups: Array<{ key: string; title: string; date: Date; tests: Array<{ id: string; name: string; row?: any }> }> = [];
  const included = new Set<string>();
  for (const s of sessions) {
    let tasks: any[] = []; try { tasks = JSON.parse(s.tasksSnapshot); } catch {}
    for (const t of tasks.filter(t => t.type === "ASSESSMENT")) {
      const tests = parseAssessment(t.assessment).tests.map(test => {
        const row = videos.find(v => v.sessionId === s.id && v.taskId === t.id && v.testId === test.id);
        if (row) included.add(row.id);
        return { id: test.id, name: test.name, row };
      });
      groups.push({ key: s.id + t.id, title: t.title, date: s.scheduledDate, tests });
    }
  }
  // Keep deliveries accessible after a session/test is removed from the calendar.
  for (const row of videos.filter(v => v.url && !included.has(v.id))) {
    const key = "archive:" + (row.sessionId || row.assessedAt.toISOString()) + row.taskId;
    let g = groups.find(g => g.key === key);
    if (!g) { g = { key, title: row.assessmentTitle + " · Archivo", date: row.assessedAt, tests: [] }; groups.push(g); }
    g.tests.push({ id: row.id, name: row.testTitle, row });
  }
  groups.sort((a, b) => b.date.getTime() - a.date.getTime());
  return <section className="space-y-3">
    <div><h2 className="font-semibold">🩺 Valoraciones y vídeos de test</h2><p className="text-xs text-neutral-500">Cada valoración conserva sus entregas para comparar la evolución.</p></div>
    {!groups.length && <p className="text-sm text-neutral-500">Añade una actividad «Valoración» desde el calendario o un programa para solicitar los vídeos.</p>}
    {groups.map(g => <details key={g.key} className="rounded-xl border border-neutral-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">{g.title} · {g.date.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}<span className="block text-xs font-normal text-neutral-500 mt-1">{g.tests.filter(t => t.row?.url).length}/{g.tests.length} recibidos · {g.tests.filter(t => t.row?.url && !t.row.reviewedAt).length} por revisar</span></summary>
      <div className="grid md:grid-cols-2 gap-4 mt-4">{g.tests.map(t => <section key={t.id} className="border rounded-xl p-3"><h3 className="text-sm font-semibold mb-2">{t.name}</h3>{t.row?.url ? <AssessmentReview row={{ id: t.row.id, url: "/api/assessments/media?id=" + t.row.id + "&v=" + t.row.uploadedAt?.getTime(), version: t.row.uploadedAt?.toISOString(), videoTitle: t.row.videoTitle, videoDescription: t.row.videoDescription, coachNotes: t.row.coachNotes, reviewedAt: t.row.reviewedAt?.toISOString() || null }} /> : <p className="text-xs text-neutral-500">Pendiente de subir</p>}</section>)}</div>
    </details>)}
  </section>;
}
