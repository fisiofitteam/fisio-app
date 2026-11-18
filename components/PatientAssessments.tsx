import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { pilotSnapshotRefs, PILOT_PROGRAM_ID } from "@/lib/shoulder-pilot-snapshot";
import { prisma } from "@/lib/prisma";
import { parseAssessment } from "@/lib/assessments";
import { partitionAssessmentHistory } from "@/lib/assessment-history";
import { AssessmentReview } from "@/components/AssessmentReview";

type AssessmentGroup = {
  key: string;
  title: string;
  date: Date;
  sessionId?: string;
  sessionTitle?: string;
  completedAt?: Date | null;
  patientNotes?: string | null;
  hasDelivery?: boolean;
  pilotSessionId?: string;
  tests: Array<{ id: string; name: string; row?: any }>;
};

const dateLabel = (date: Date) => date.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });

export async function PatientAssessments({ patientId }: { patientId: string }) {
  const now = new Date();
  const baseWhere: Prisma.ProgramSessionWhereInput = {
    assignment: { patientId }, tasksSnapshot: { contains: '"ASSESSMENT"' },
  };
  const activeWhere: Prisma.ProgramSessionWhereInput = {
    OR: [
      { scheduledDate: { lte: now } },
      { completedAt: { not: null } },
      { assessmentVideos: { some: { url: { not: null } } } },
    ],
  };
  const select = {
    id: true, weekNumber: true, scheduledDate: true, tasksSnapshot: true,
    completedAt: true, patientNotes: true,
    assessmentVideos: { where: { url: { not: null } }, select: { id: true }, take: 1 },
    assignment: { select: { programId: true } },
  } as const;
  // Future blank retests have their own limit and cannot displace received history.
  const [historySessions, futureSessions, videos] = await Promise.all([
    prisma.programSession.findMany({ where: { AND: [baseWhere, activeWhere] }, orderBy: { scheduledDate: "desc" }, take: 100, select }),
    prisma.programSession.findMany({ where: { AND: [baseWhere, { NOT: activeWhere }] }, orderBy: { scheduledDate: "asc" }, take: 100, select }),
    prisma.assessmentVideo.findMany({ where: { patientId }, orderBy: { assessedAt: "desc" }, take: 500 }),
  ]);
  const groups: AssessmentGroup[] = [];
  const included = new Set<string>();
  for (const s of [...historySessions, ...futureSessions]) {
    const refs = s.assignment.programId === PILOT_PROGRAM_ID && [1, 14].includes(s.weekNumber)
      ? pilotSnapshotRefs(s.tasksSnapshot) : null;
    const knownShoulderWeek = s.assignment.programId === PILOT_PROGRAM_ID && [1, 14].includes(s.weekNumber);
    const sessionInfo = {
      sessionId: s.id, date: s.scheduledDate, completedAt: s.completedAt, patientNotes: s.patientNotes,
      hasDelivery: s.assessmentVideos.length > 0,
      sessionTitle: knownShoulderWeek
        ? (s.weekNumber === 14 ? "Revaloración de hombro · semana 14" : "Valoración inicial de hombro · semana 1")
        : "Valoración",
    };
    const battery: AssessmentGroup | null = refs
      ? { ...sessionInfo, key: "pilot:" + s.id, title: sessionInfo.sessionTitle, pilotSessionId: s.id, tests: [] }
      : null;
    if (battery) groups.push(battery);
    let tasks: any[] = []; try { tasks = JSON.parse(s.tasksSnapshot); } catch {}
    for (const t of tasks.filter(t => t.type === "ASSESSMENT")) {
      const tests = parseAssessment(t.assessment).tests.map(test => {
        const row = videos.find(v => v.sessionId === s.id && v.taskId === t.id && v.testId === test.id);
        if (row) included.add(row.id);
        return { id: test.id, name: test.name, row };
      });
      if (battery && refs) battery.tests.push(...tests.filter(test => refs.get(test.id) === t.id));
      const rest = refs ? tests.filter(test => refs.get(test.id) !== t.id) : tests;
      if (rest.length || !refs) groups.push({ ...sessionInfo, key: s.id + t.id, title: t.title, tests: rest });
    }
  }
  // Keep deliveries accessible after a session/test is removed from the calendar.
  for (const row of videos.filter(v => v.url && !included.has(v.id))) {
    const key = "archive:" + (row.sessionId || row.assessedAt.toISOString()) + row.taskId;
    let g = groups.find(g => g.key === key);
    if (!g) {
      g = { key, title: row.assessmentTitle + " · Archivo", date: row.assessedAt, hasDelivery: true, tests: [] };
      groups.push(g);
    }
    g.tests.push({ id: row.id, name: row.testTitle, row });
  }
  const { current, upcoming } = partitionAssessmentHistory(groups, now);
  const shownSessionInfo = new Set<string>();
  function renderGroup(g: AssessmentGroup, scheduled = false) {
    const showSessionInfo = !!g.sessionId && !shownSessionInfo.has(g.sessionId);
    if (g.sessionId) shownSessionInfo.add(g.sessionId);
    return <section key={g.key} className="space-y-2">
      {showSessionInfo && <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
        <h3 className="text-sm font-semibold">{g.sessionTitle}</h3>
        <p className="text-xs text-neutral-600">Prevista para el {dateLabel(g.date)}{g.completedAt && <> · Completada el {dateLabel(g.completedAt)}</>}</p>
        {g.pilotSessionId && <p className="text-sm text-neutral-600">{g.tests.filter(t => t.row?.url).length}/{g.tests.length} vídeos recibidos</p>}
        {g.patientNotes && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
          <p className="font-semibold">Sensaciones del paciente</p>
          <p className="whitespace-pre-wrap">{g.patientNotes}</p>
        </div>}
        {g.pilotSessionId && <Link className="btn btn-accent inline-block mt-2" href={"/fisio/valoraciones/" + g.pilotSessionId}>Abrir revisión y perfil</Link>}
      </div>}
      <details className="rounded-xl border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          {g.pilotSessionId ? "Vídeos y comentarios de la batería" : g.title} · {dateLabel(g.date)}
          {scheduled && <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-600">Programada</span>}
          <span className="block text-xs font-normal text-neutral-500 mt-1">{g.tests.filter(t => t.row?.url).length}/{g.tests.length} recibidos · {g.tests.filter(t => t.row?.url && !t.row.reviewedAt).length} por revisar</span>
        </summary>
        <div className="grid md:grid-cols-2 gap-4 mt-4">{g.tests.map(t => <section key={t.id} className="border rounded-xl p-3">
          <h3 className="text-sm font-semibold mb-2">{t.name}</h3>
          {t.row?.url ? <AssessmentReview row={{
            id: t.row.id, testTitle: t.name,
            url: "/api/assessments/media?id=" + t.row.id + "&v=" + t.row.uploadedAt?.getTime(),
            version: t.row.uploadedAt?.toISOString(), videoTitle: t.row.videoTitle,
            videoDescription: t.row.videoDescription, coachNotes: t.row.coachNotes,
            reviewedAt: t.row.reviewedAt?.toISOString() || null,
          }} /> : <p className="text-xs text-neutral-500">Pendiente de subir</p>}
        </section>)}</div>
      </details>
    </section>;
  }
  return <section className="space-y-3">
    <div><h2 className="font-semibold">🩺 Valoraciones y vídeos de test</h2><p className="text-xs text-neutral-500">Las entregas recibidas y las valoraciones actuales aparecen primero. Las próximas valoraciones están al final.</p></div>
    {!groups.length && <p className="text-sm text-neutral-500">Añade una actividad «Valoración» desde el calendario o un programa para solicitar los vídeos.</p>}
    {current.map(g => renderGroup(g))}
    {upcoming.length > 0 && <details className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold">Próximas valoraciones<span className="block mt-1 text-xs font-normal text-neutral-500">Programadas para más adelante, todavía sin entregas.</span></summary>
      <div className="mt-4 space-y-3">{upcoming.map(g => renderGroup(g, true))}</div>
    </details>}
  </section>;
}
