import type { Prisma } from "@prisma/client";
import type { ActiveProfessional } from "@/lib/session";
import type { RecordingSummary } from "@/components/RecordingList";
import { prisma } from "@/lib/prisma";
import { evidencePatientScope } from "@/lib/patient-evidence";
import { RecordingError } from "@/lib/recordings";

export type RecordingLibraryResult = { recordings: RecordingSummary[]; total: number; page: number; pageSize: number };
export async function getRecordingLibrary(actor: ActiveProfessional | null, filters: { q?: string; patientId?: string; page?: string } = {}): Promise<RecordingLibraryResult> {
  const scope = evidencePatientScope(actor);
  if (!scope) throw new RecordingError(403, "No tienes acceso a las grabaciones.");
  const q = (filters.q || "").trim().slice(0, 160), patientId = (filters.patientId || "").slice(0, 100);
  const requestedPage = Number(filters.page || 1), pageSize = 24;
  // Always intersect filters with clinical access; searching never broadens it.
  const where: Prisma.PatientRecordingWhereInput = {
    status: { in: ["ready", "deleting"] }, patient: { is: scope },
    ...(patientId ? { patientId } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: "insensitive" as const } },
      { patient: { is: { fullName: { contains: q, mode: "insensitive" as const } } } },
    ] } : {}),
  };
  const total = await prisma.patientRecording.count({ where });
  const page = Math.min(Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1), Math.max(1, Math.ceil(total / pageSize)));
  const rows = await prisma.patientRecording.findMany({ where, take: pageSize, skip: (page - 1) * pageSize,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, notes: true, status: true, createdAt: true, durationSeconds: true, size: true,
      shareTokenHash: true, shareExpiresAt: true,
      patient: { select: { id: true, fullName: true } }, createdBy: { select: { fullName: true } },
    },
  });
  return { total, page, pageSize, recordings: rows.map(r => ({
    id: r.id, title: r.title, notes: r.notes, status: r.status, createdAt: r.createdAt.toISOString(),
    durationSeconds: r.durationSeconds, size: r.size,
    shared: !!r.shareTokenHash && !!r.shareExpiresAt && r.shareExpiresAt > new Date(),
    patientId: r.patient.id, patientName: r.patient.fullName, createdByName: r.createdBy?.fullName || null,
  })) };
}
