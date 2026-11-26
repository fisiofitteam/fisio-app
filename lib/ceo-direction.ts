import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { bankAggregate } from "@/lib/bank-finance";
import { directionObservations, directionSettings, evaluateTargets, priorityTitle, type priorityCreate, type priorityUpdate, type Observation } from "./ceo-direction-contract";
import type { z } from "zod";

export class DirectionError extends Error { constructor(message: string, public status = 409) { super(message); } }
const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const close = (status: string) => status === "done" || status === "discarded";
async function currentEvidence() {
  const [banking, report] = await Promise.all([
    bankAggregate().catch(() => ({ status: "unavailable", currentBalanceCents: null })),
    prisma.ceoReport.findFirst({ where: { periodType: "grok_daily" }, orderBy: { generatedAt: "desc" }, select: { id: true, generatedAt: true, metrics: true, narrative: true } }),
  ]);
  return { banking, report, observations: directionObservations(banking, report) };
}
function observationsFromJson(json: string | null): Observation[] {
  try { const list: unknown = JSON.parse(json || "[]"); return Array.isArray(list) ? list : []; } catch { return []; }
}
export async function directionSummary(founderId: string) {
  const [evidence, settings, counts] = await Promise.all([
    currentEvidence(), prisma.ceoDirectionSettings.findUnique({ where: { founderId } }),
    prisma.ceoPriority.groupBy({ by: ["status"], where: { founderId }, _count: true }),
  ]);
  const parsed = directionSettings.safeParse({ version: settings?.version || 0, targets: JSON.parse(settings?.targetsJson || "[]") });
  const targets = parsed.success ? parsed.data.targets : [];
  const report = evidence.report;
  return { banking: evidence.banking, observations: evidence.observations, targets, settingsVersion: settings?.version || 0,
    targetStates: evaluateTargets(evidence.observations, targets),
    report: report ? { id: report.id, generatedAt: report.generatedAt, actions: [0,1,2].flatMap(index => { const title = priorityTitle(report.narrative, index); return title ? [{ index, title }] : []; }) } : null,
    counts: Object.fromEntries(["planned", "in_progress", "blocked", "done", "discarded"].map(status => [status, counts.find(g => g.status === status)?._count || 0])),
  };
}
export async function directionOverview(founderId: string) {
  const [summary, open, closed] = await Promise.all([
    directionSummary(founderId),
    prisma.ceoPriority.findMany({ where: { founderId, status: { notIn: ["done", "discarded"] } }, orderBy: { updatedAt: "desc" }, take: 100, include: { events: { orderBy: { createdAt: "desc" }, take: 20 } } }),
    prisma.ceoPriority.findMany({ where: { founderId, status: { in: ["done", "discarded"] } }, orderBy: { updatedAt: "desc" }, take: 50, include: { events: { orderBy: { createdAt: "desc" }, take: 20 } } }),
  ]);
  return { ...summary, priorities: [...open, ...closed].map(({ baselineJson, outcomeJson, requestHash: _, ...p }) => ({ ...p, events: p.events.map(({requestHash: _hash, requestId: _request, ...e}) => e), baseline: observationsFromJson(baselineJson), outcome: observationsFromJson(outcomeJson) })) };
}
export async function createPriority(founderId: string, d: z.infer<typeof priorityCreate>) {
  const requestHash = hash(d);
  const existing = await prisma.ceoPriority.findUnique({ where: { id: d.id } });
  if (existing) {
    if (existing.founderId !== founderId || existing.requestHash !== requestHash) throw new DirectionError("Identificador ya utilizado.");
    return { id: existing.id, duplicate: true };
  }
  const report = await prisma.ceoReport.findFirst({ where: { id: d.reportId, periodType: "grok_daily" }, select: { narrative: true } });
  const title = report ? priorityTitle(report.narrative, d.actionIndex) : null;
  if (!title) throw new DirectionError("La recomendación no está disponible.", 404);
  const { observations } = await currentEvidence();
  return prisma.$transaction(async tx => {
    const same = await tx.ceoPriority.findFirst({ where: { founderId, reportId: d.reportId, actionIndex: d.actionIndex } });
    if (same) return { id: same.id, duplicate: true };
    await tx.ceoPriority.create({ data: { id: d.id, founderId, reportId: d.reportId, actionIndex: d.actionIndex, title, requestHash, dueDate: d.dueDay ? new Date(d.dueDay + "T12:00:00Z") : null, baselineJson: JSON.stringify(observations) } });
    await tx.ceoPriorityEvent.create({ data: { id: randomUUID(), requestId: d.id, requestHash, priorityId: d.id, authorId: founderId, version: 0, status: "planned", detailJson: JSON.stringify({ dueDay: d.dueDay, resultNote: "", observations }) } });
    return { id: d.id, duplicate: false };
  }, { isolationLevel: "Serializable" });
}
export async function updatePriority(founderId: string, d: z.infer<typeof priorityUpdate>) {
  const requestHash = hash(d);
  const event = await prisma.ceoPriorityEvent.findUnique({ where: { requestId: d.requestId } });
  if (event) {
    if (event.authorId !== founderId || event.priorityId !== d.id || event.requestHash !== requestHash) throw new DirectionError("Identificador de revisión ya utilizado.");
    return { ok: true, duplicate: true };
  }
  const evidence = close(d.status) ? await currentEvidence() : null;
  return prisma.$transaction(async tx => {
    const row = await tx.ceoPriority.findUnique({ where: { id: d.id } });
    if (!row || row.founderId !== founderId) throw new DirectionError("Prioridad no encontrada.", 404);
    if (row.version !== d.version) throw new DirectionError("La prioridad ha cambiado. Actualiza antes de guardar.");
    const outcomeJson = evidence ? JSON.stringify(evidence.observations) : null;
    const changed = await tx.ceoPriority.updateMany({ where: { id: d.id, founderId, version: d.version }, data: { status: d.status, dueDate: d.dueDay ? new Date(d.dueDay + "T12:00:00Z") : null, resultNote: d.resultNote, outcomeJson, closedAt: close(d.status) ? new Date() : null, version: { increment: 1 } } });
    if (!changed.count) throw new DirectionError("Otra revisión ha cambiado la prioridad.");
    await tx.ceoPriorityEvent.create({ data: { id: randomUUID(), requestId: d.requestId, requestHash, priorityId: d.id, authorId: founderId, version: d.version + 1, status: d.status, detailJson: JSON.stringify({ dueDay: d.dueDay, resultNote: d.resultNote, observations: evidence?.observations || null }) } });
    return { ok: true, duplicate: false };
  }, { isolationLevel: "Serializable" });
}
export async function saveDirectionSettings(founderId: string, d: z.infer<typeof directionSettings>) {
  return prisma.$transaction(async tx => {
    await tx.ceoDirectionSettings.upsert({ where: { founderId }, create: { founderId }, update: {} });
    const changed = await tx.ceoDirectionSettings.updateMany({ where: { founderId, version: d.version }, data: { targetsJson: JSON.stringify(d.targets), version: { increment: 1 } } });
    if (!changed.count) throw new DirectionError("Los objetivos han cambiado. Actualiza antes de guardar.");
    return { ok: true };
  }, { isolationLevel: "Serializable" });
}
// Existing read-only metrics channel: counts only. Private notes and histories stay in the founder panel.
export async function directionAggregate() {
  const founderId = process.env.GROK_CEO_FOUNDER_ID;
  if (!founderId) return { status: "not_configured" };
  try {
    const [groups, settings] = await Promise.all([
      prisma.ceoPriority.groupBy({ by: ["status"], where: { founderId }, _count: true }),
      prisma.ceoDirectionSettings.findUnique({ where: { founderId }, select: { targetsJson: true } }),
    ]);
    const targets = directionSettings.safeParse({ version: 0, targets: JSON.parse(settings?.targetsJson || "[]") });
    return { status: "available", priorities: Object.fromEntries(["planned", "in_progress", "blocked", "done", "discarded"].map(status => [status, groups.find(g => g.status === status)?._count || 0])), targets: targets.success ? targets.data.targets : [], definition: "Founder-managed tracking only. Counts do not prove business impact. No permission to create or execute tasks." };
  } catch { return { status: "unavailable" }; }
}
