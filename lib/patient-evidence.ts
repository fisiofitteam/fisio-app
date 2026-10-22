import { prisma } from "@/lib/prisma";
import { getActiveProfessional, type ActiveProfessional } from "@/lib/session";

export const EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "video/mp4", "video/quicktime", "video/webm", "application/pdf"];
export const MAX_EVIDENCE_BYTES = 1024 * 1024 * 1024;
export const MAX_WHATSAPP_CHARS = 200000; // Legacy single-request import.
export const MAX_WHATSAPP_BYTES = 50 * 1024 * 1024;
export function canUseEvidence(user: ActiveProfessional | null): user is ActiveProfessional {
  return !!user && [user.role, ...user.extraRoles].some(r => ["ceo", "head_success", "fisio"].includes(r));
}
export async function canAccessEvidencePatient(patientId: string, user?: ActiveProfessional | null) {
  const actor = user === undefined ? await getActiveProfessional() : user;
  if (!canUseEvidence(actor)) return false;
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { assignedProfessionalId: true } });
  if (!patient) return false;
  if (actor.isManager || patient.assignedProfessionalId === actor.id) return true;
  return !!await prisma.patientDerivation.findFirst({ where: { patientId, toProfessionalId: actor.id }, select: { id: true } });
}
export async function evidencePatientIds(user: ActiveProfessional): Promise<string[] | undefined> {
  if (user.isManager) return undefined;
  const [assigned, derived] = await Promise.all([
    prisma.patient.findMany({ where: { assignedProfessionalId: user.id }, select: { id: true } }),
    prisma.patientDerivation.findMany({ where: { toProfessionalId: user.id }, select: { patientId: true } }),
  ]);
  return [...new Set([...assigned.map(p => p.id), ...derived.map(p => p.patientId)])];
}

/** Unassigned uploads belong to their uploader and clinical managers. */
export async function canAccessEvidence(row: { patientId: string | null; createdById: string }, user?: ActiveProfessional | null) {
  const actor = user === undefined ? await getActiveProfessional() : user;
  if (!canUseEvidence(actor)) return false;
  return row.patientId ? canAccessEvidencePatient(row.patientId, actor) : actor.isManager || row.createdById === actor.id;
}
