import type { Prisma } from "@prisma/client";
import type { ActiveProfessional } from "@/lib/session";
import { evidencePatientScope, canAccessEvidencePatient } from "@/lib/patient-evidence";

export function recordingAccessScope(actor: ActiveProfessional | null): Prisma.PatientRecordingWhereInput | null {
  if (!actor) return null;
  if (actor.isManager) return {};
  const patients = evidencePatientScope(actor);
  const ownGeneral = { patientId: null, createdById: actor.id };
  return patients ? { OR: [ownGeneral, { patient: { is: patients } }] } : ownGeneral;
}
export async function canAccessRecordingRow(row: { patientId: string | null; createdById: string | null }, actor: ActiveProfessional | null) {
  if (!actor) return false;
  return row.patientId ? canAccessEvidencePatient(row.patientId, actor) : actor.isManager || row.createdById === actor.id;
}
