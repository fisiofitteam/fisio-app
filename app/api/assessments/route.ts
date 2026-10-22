import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { assessmentAccess, assignedAssessment, finishAssessmentUpload } from "@/lib/assessment-access";
import { MAX_ASSESSMENT_BYTES, ASSESSMENT_MIMES } from "@/lib/assessments";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const patientId = req.nextUrl.searchParams.get("patientId");
  let owner = patientId;
  if (sessionId) {
    const s = await prisma.programSession.findUnique({ where: { id: sessionId }, select: { assignment: { select: { patientId: true } } } });
    owner = s?.assignment.patientId || null;
  }
  if (!owner || !await assessmentAccess(owner)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const material = req.nextUrl.searchParams.get("material") === "1";
  const page = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("page")) || 0));
  const where = { patientId: owner, ...(sessionId ? { sessionId } : {}), ...(material ? { url: { not: null }, uploadedAt: { not: null } } : {}) };
  const rows = await prisma.assessmentVideo.findMany({ where, orderBy: [{ assessedAt: "desc" }, { id: "desc" }],
    skip: material ? page * 30 : 0, take: material ? 30 : 500,
    select: { id: true, sessionId: true, taskId: true, testId: true, assessmentTitle: true, testTitle: true, assessedAt: true, url: true, uploadedAt: true, reviewedAt: true, coachNotes: true } });
  const items = rows.map(r => ({ ...r, version: r.uploadedAt?.toISOString(), url: r.url ? "/api/assessments/media?id=" + r.id + "&v=" + r.uploadedAt?.getTime() : null }));
  return NextResponse.json(material ? { items, total: await prisma.assessmentVideo.count({ where }) } : items, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: NextRequest) {
  try {
    if (!process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "El almacenamiento de valoraciones todavía no está configurado." }, { status: 503 });
    const b = await req.json();
    if (![b.sessionId, b.taskId, b.testId].every(x => typeof x === "string")) throw new Error("Faltan datos del test.");
    if (!ASSESSMENT_MIMES.includes(b.mimeType) || !Number.isInteger(b.size) || b.size <= 0 || b.size > MAX_ASSESSMENT_BYTES) throw new Error("Elige un vídeo MP4, MOV o WebM de hasta 1 GB.");
    const { session, task, test } = await assignedAssessment(b.sessionId, b.taskId, b.testId);
    const row = await prisma.assessmentVideo.upsert({
      where: { sessionId_taskId_testId: { sessionId: session.id, taskId: task.id, testId: test.id } },
      create: { patientId: session.assignment.patientId, sessionId: session.id, taskId: task.id, testId: test.id,
        assessmentTitle: task.title, testTitle: test.name, assessedAt: session.scheduledDate }, update: {},
    });
    if (row.reviewedAt) return NextResponse.json({ error: "Tu fisio ya ha revisado este vídeo." }, { status: 409 });
    const pathname = "assessments/" + row.id + "/" + randomUUID() + (b.mimeType === "video/quicktime" ? ".mov" : b.mimeType === "video/webm" ? ".webm" : ".mp4");
    const updated = await prisma.assessmentVideo.updateMany({ where: { id: row.id, reviewedAt: null }, data: {
      pendingPath: pathname, pendingSize: b.size, pendingMime: b.mimeType, pendingUntil: new Date(Date.now() + 24 * 3600000),
    } });
    if (!updated.count) throw new Error("Tu fisio acaba de revisar este vídeo.");
    return NextResponse.json({ id: row.id, pathname });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo preparar la subida." }, { status: 400 }); }
}
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const row = typeof b.id === "string" ? await prisma.assessmentVideo.findUnique({ where: { id: b.id } }) : null;
    if (!row) return NextResponse.json({ error: "Entrega no disponible" }, { status: 404 });
    if (b.action === "confirm") {
      if (!await assessmentAccess(row.patientId, true)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      if (!row.sessionId) throw new Error("La valoración ya no está asignada.");
      await assignedAssessment(row.sessionId, row.taskId, row.testId);
      if (row.pendingPath === b.pathname) await finishAssessmentUpload(row.id, b.pathname);
      const current = await prisma.assessmentVideo.findUnique({ where: { id: row.id } });
      if (!current?.url || !current.url.includes(encodeURI(b.pathname))) throw new Error("No se ha confirmado la subida. Inténtalo de nuevo.");
      return NextResponse.json({ ok: true });
    }
    const actor = await getSessionUser();
    if (actor?.kind !== "professional" || !await canAccessEvidencePatient(row.patientId, actor.pro)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    if (typeof b.version !== "string" || !Number.isFinite(new Date(b.version).getTime())) throw new Error("Recarga el vídeo antes de revisarlo.");
    if (!row.url || (b.action !== "review" && b.action !== "notes")) throw new Error("Acción no válida.");
    if (typeof b.coachNotes !== "string" || b.coachNotes.length > 5000) throw new Error("Comentario demasiado largo.");
    const result = await prisma.assessmentVideo.updateMany({ where: { id: row.id, uploadedAt: new Date(b.version), updatedAt: row.updatedAt }, data: {
      coachNotes: b.coachNotes.trim(), ...(b.action === "review" ? { reviewedAt: new Date(), reviewedById: actor.pro.id, pendingPath: null, pendingUntil: null } : {}),
    } });
    if (!result.count) return NextResponse.json({ error: "El vídeo ha cambiado. Recarga antes de revisarlo." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 }); }
}
