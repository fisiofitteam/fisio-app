/**
 * Genera un brief en Markdown con la ficha completa del paciente para
 * inyectarlo al system prompt de los agentes de Fisio IA (aquellos con
 * usesPatientContext=true).
 *
 * Contenido similar al de la vista de "Exportar" del fisio: datos básicos,
 * anamnesis, programa activo, adaptaciones (con carga máx), últimos WODs,
 * métricas y suscripción. Compactado a plain text sin markup pesado para
 * ahorrar tokens.
 */
import { prisma } from "./prisma";

function fDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const t = String(s).trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

export async function buildPatientBrief(patientId: string): Promise<string | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) return null;

  const [adaptations, wodLogs, metrics, activeAssignments, prs, clinicalCase, sessions, sessionsWithNotes] = await Promise.all([
    prisma.patientAdaptation.findMany({
      where: { patientId, state: { not: "OK" } },
      include: { movement: { include: { category: true } } },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.wodLog.findMany({ where: { patientId }, orderBy: { submittedAt: "desc" }, take: 6 }),
    prisma.patientMetric.findMany({
      where: { patientId, isVisible: true },
      include: { entries: { orderBy: { recordedAt: "desc" }, take: 5 } },
      orderBy: [{ isPreset: "desc" }, { order: "asc" }],
    }),
    prisma.programAssignment.findMany({
      where: { patientId, isActive: true },
      include: { program: true },
      orderBy: { startDate: "desc" },
      take: 5,
    }),
    prisma.patientPR.findMany({
      where: { patientId },
      orderBy: [{ name: "asc" }, { recordedAt: "desc" }],
      take: 40,
    }).catch(() => [] as any[]),
    prisma.clinicalSessionCase.findUnique({ where: { patientId } }).catch(() => null),
    prisma.programSession.findMany({
      where: { assignment: { patientId } },
      orderBy: { scheduledDate: "desc" },
      take: 6,
    }),
    // Sesiones con sensaciones del paciente — feedback subjetivo tras
    // completar (nuevo flujo obligatorio en RECUPERA/CONSOLIDA).
    prisma.programSession.findMany({
      where: {
        assignment: { patientId },
        patientNotes: { not: null },
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: 8,
    }).catch(() => [] as any[]),
  ]);

  const lines: string[] = [];
  lines.push(`# Ficha del paciente: ${patient.fullName}`);
  const basics: string[] = [];
  if (patient.programType) basics.push(`Programa: ${patient.programType}`);
  if (patient.difficulty) basics.push(`Dificultad: ${patient.difficulty}`);
  if (patient.country) basics.push(`País: ${patient.country}`);
  if (patient.appliedLevel) basics.push(`Perfil clínico: ${patient.appliedLevel.profile.name} · ${patient.appliedLevel.name}`);
  if (basics.length) lines.push(basics.join(" · "));
  if (patient.diagnosis) lines.push(`Diagnóstico: ${truncate(patient.diagnosis, 400)}`);
  if (patient.bodyZone) lines.push(`Zona afectada: ${patient.bodyZone}`);
  if (patient.subscriptionStartDate) {
    lines.push(`Alta: ${fDate(patient.subscriptionStartDate)} · ${patient.subscriptionPeriodMonths} meses contratados`);
  }

  // Anamnesis (resumen de campos rellenados)
  try {
    const anamnesis = patient.anamnesisData ? JSON.parse(patient.anamnesisData) : {};
    const entries = Object.entries(anamnesis).filter(([, v]) => v != null && String(v).trim() !== "");
    if (entries.length > 0) {
      lines.push("");
      lines.push("## Anamnesis");
      for (const [k, v] of entries.slice(0, 20)) {
        lines.push(`- ${k}: ${truncate(String(v), 200)}`);
      }
    }
  } catch { /* noop */ }

  if (activeAssignments.length > 0) {
    lines.push("");
    lines.push("## Programas activos");
    for (const a of activeAssignments) {
      lines.push(`- ${a.program.name} — desde ${fDate(a.startDate)} (${a.weeksCount} sem)`);
    }
  }

  if (adaptations.length > 0) {
    lines.push("");
    lines.push("## Adaptaciones (movimientos con restricción)");
    for (const a of adaptations) {
      const state = a.state === "BLOCKED" ? "BLOQUEADO" : "CONDICIONAL";
      const parts = [`- ${a.movement.displayName} [${state}]`];
      if (a.substitutionText) parts.push(`sustituto: ${a.substitutionText}`);
      if (a.loadConstraint) parts.push(`carga: ${a.loadConstraint}`);
      if (a.physioWarning) parts.push(`aviso: ${a.physioWarning}`);
      lines.push(parts.join(" · "));
    }
  }

  if (prs && prs.length > 0) {
    lines.push("");
    lines.push("## PRs recientes");
    for (const p of prs.slice(0, 15)) {
      lines.push(`- ${(p as any).name}: ${(p as any).value}${(p as any).unit ? " " + (p as any).unit : ""} (${fDate((p as any).recordedAt)})`);
    }
  }

  if (metrics.length > 0) {
    lines.push("");
    lines.push("## Métricas (últimos valores)");
    for (const m of metrics.slice(0, 10)) {
      const last = m.entries[0];
      if (!last) continue;
      lines.push(`- ${m.name}${m.unit ? ` (${m.unit})` : ""}: último ${last.value} (${fDate(last.recordedAt)})`);
    }
  }

  if (wodLogs.length > 0) {
    lines.push("");
    lines.push("## Últimos WODs registrados");
    for (const w of wodLogs) {
      const raw = truncate(w.rawText ?? "", 120);
      lines.push(`- ${fDate(w.submittedAt)}: ${raw}`);
    }
  }

  if (sessionsWithNotes && sessionsWithNotes.length > 0) {
    lines.push("");
    lines.push("## Sensaciones tras sesión (últimas)");
    for (const s of sessionsWithNotes as any[]) {
      const when = fDate(s.completedAt);
      lines.push(`- ${when}: ${truncate(s.patientNotes ?? "", 300)}`);
    }
  }

  if (sessions.length > 0) {
    lines.push("");
    lines.push("## Últimas sesiones");
    for (const s of sessions) {
      const state = s.completedAt ? "✓" : "·";
      lines.push(`- ${fDate(s.scheduledDate)} ${state}`);
    }
  }

  if (clinicalCase) {
    lines.push("");
    lines.push("## Sesión clínica (caso interno)");
    const cc: any = clinicalCase;
    if (cc.situation) lines.push(`Situación: ${truncate(cc.situation, 400)}`);
    if (cc.proposedSolutions) lines.push(`Propuestas: ${truncate(cc.proposedSolutions, 400)}`);
    if (cc.consensusSolution) lines.push(`Consenso: ${truncate(cc.consensusSolution, 400)}`);
  }

  return lines.join("\n");
}
