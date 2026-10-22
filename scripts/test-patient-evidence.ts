import assert from "node:assert/strict";

async function main() {
  delete process.env.ANTHROPIC_API_KEY; // No paid calls or real patient data.
  const monday = new Date("2026-10-19T00:00:00Z"), end = new Date("2026-10-26T00:00:00Z");
  const patient = { id: "test-patient", fullName: "Atleta de prueba", programType: "RECUPERA", assignedProfessionalId: null };
  let derivation = false, saved: any = null;
  const attachments = [{ id: "video-1", patientId: patient.id, createdAt: new Date("2026-10-21T12:00:00Z"), name: "Logro.mov", kind: "video", notes: "Primera dominada sin molestias", url: "https://example.test/video" }];
  const session = { id: "s1", completedAt: new Date("2026-10-20T12:00:00Z"), scheduledDate: new Date("2026-10-20T00:00:00Z"), patientNotes: "Me siento mejor",
    assignment: { program: { name: "Readaptación" } },
    tasksSnapshot: JSON.stringify([{ id: "form-1", type: "FORM", title: "Seguimiento", questions: JSON.stringify([{ id: "q1", text: "¿Cómo te encuentras?" }]) }]),
    responses: JSON.stringify({ "form-1": { q1: "He vuelto a entrenar" } }) };
  const db: any = {
    patient: { findUnique: async () => patient, findMany: async () => [patient] },
    patientDerivation: { findFirst: async () => derivation ? { id: "derived" } : null },
    wodLog: { findMany: async (q: any) => q.distinct ? [{ patientId: patient.id }] : [{ id: "w1", completedAt: null, submittedAt: new Date("2026-10-22T10:00:00Z"), rawText: "5 pull-ups", notes: "Sin dolor", painScore: 0, rpe: 6 }] },
    patientCallFormResponse: { findMany: async () => [] },
    programSession: { findMany: async () => [session], count: async () => 1, groupBy: async () => [] },
    assessmentVideo: { findMany: async () => [] },
    patientEvidence: { findMany: async (q: any) => q.distinct ? [{ patientId: patient.id }] : attachments },
    advanceSessionLog: { groupBy: async () => [] },
    metricDefinition: { findMany: async () => [] },
    patientMetric: { findMany: async () => [] },
    patientWeeklyReport: {
      findUnique: async () => saved,
      upsert: async (q: any) => { assert.equal(q.where.patientId_weekStartDate.patientId, patient.id); saved = { ...q.create }; return saved; },
    },
    professional: { findMany: async () => [] },
  };
  (globalThis as any).prisma = db;
  const { collectWeekExtras, extrasInWeek } = await import("../lib/weekly-evidence");
  const { canAccessEvidence, canAccessEvidencePatient, canUseEvidence } = await import("../lib/patient-evidence");
  const { refreshPatientWeek, runWeeklyReportsForWeek } = await import("../lib/weekly-reports");

  const user: any = { id: "fisio-1", role: "fisio", extraRoles: [], isManager: false };
  assert.equal(await canAccessEvidencePatient(patient.id, user), false, "unrelated fisio must be denied");
  derivation = true;
  assert.equal(await canAccessEvidencePatient(patient.id, user), true, "derived patient is available");
  derivation = false;
  assert.equal(await canAccessEvidencePatient(patient.id, { ...user, isManager: true, role: "ceo" }), true);
  assert.equal(canUseEvidence({ ...user, role: "setter" }), false);
  assert.equal(canUseEvidence({ ...user, role: "setter", extraRoles: ["fisio"] }), true);
  assert.equal(canUseEvidence(null), false);
  const unassigned = { patientId: null, createdById: user.id };
  assert.equal(await canAccessEvidence(unassigned, user), true, "uploader can assign their pending client");
  assert.equal(await canAccessEvidence(unassigned, { ...user, id: "other-fisio" }), false, "unassigned files are not visible to unrelated fisios");
  assert.equal(await canAccessEvidence(unassigned, { ...user, role: "ceo", isManager: true }), true);
  assert.equal(await canAccessEvidence(unassigned, null), false);
  assert.equal(await canAccessEvidence({ patientId: patient.id, createdById: user.id }, user), false, "once assigned, patient access is required even for the uploader");

  const extras = await collectWeekExtras(patient.id, monday, end);
  assert.equal(extras.wods[0].painScore, 0, "zero is a valid pain score");
  assert.equal(extras.forms[0].answers[0].question, "¿Cómo te encuentras?");
  assert.equal(extras.forms[0].answers[0].answer, "He vuelto a entrenar");
  assert.equal(extras.evidence[0].notes, "Primera dominada sin molestias");
  const boundary = { ...extras, evidence: [...extras.evidence, { ...extras.evidence[0], id: "next-week", date: end.toISOString() }] };
  assert.equal(extrasInWeek(boundary, monday).evidence.length, 1, "next Monday belongs to the next week");

  await refreshPatientWeek(patient.id, monday);
  const snapshot = JSON.parse(saved.highlights);
  assert.equal(snapshot.sessionsCompleted, 1);
  assert.equal(snapshot.extras.wods.length, 1);
  assert.equal(snapshot.extras.forms.length, 1);
  assert.equal(snapshot.extras.evidence.length, 1);
  assert.ok(snapshot.inputFingerprint);
  assert.match(saved.summary, /1 WODs/);

  // Supplemental-only weeks must be archived even without rehab sessions.
  saved = null;
  db.programSession.findMany = async () => [];
  db.programSession.count = async () => 0;
  const first = await runWeeklyReportsForWeek(monday);
  assert.equal(first.generated, 1);
  assert.equal(JSON.parse(saved.highlights).sessionsCompleted, 0);
  const repeated = await runWeeklyReportsForWeek(monday);
  assert.equal(repeated.generated, 0, "unchanged week must not regenerate");
  assert.equal(repeated.skipped, 1);
  attachments.push({ ...attachments[0], id: "video-2", name: "Nuevo logro.mov" });
  const changed = await runWeeklyReportsForWeek(monday);
  assert.equal(changed.generated, 1, "new evidence must invalidate saved summary");
  assert.equal(JSON.parse(saved.highlights).extras.evidence.length, 2);
  console.log("PASS: permissions, cross-source history, date boundaries, persistence, supplemental-only weeks and idempotent regeneration");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
