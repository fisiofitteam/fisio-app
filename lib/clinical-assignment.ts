import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Client = Pick<Prisma.TransactionClient, "professional">;
export function availableClinicalAssignee(db: Client, id: string) {
  return db.professional.findFirst({ where: { id, active: true, deletedAt: null }, select: { id: true } });
}

export const assigneeConflict = "El profesional ya no está disponible o la asignación ha cambiado. Actualiza la lista y elige otro fisio.";

// Keep the check and resulting assignment/initial period within a single transaction.
// An older form can resubmit a historical owner on unrelated edits: in that case
// omit the assignment from the write, so even a concurrent reassignment is preserved.
export async function withClinicalAssignee<T>(
  target: string | null,
  write: (tx: Prisma.TransactionClient, assignment: string | null | undefined) => Promise<T>,
  preserveForPatient?: string,
): Promise<T | null> {
  if (target !== null && typeof target !== "string") return null;
  try {
    return await prisma.$transaction(async tx => {
      if (target && !await availableClinicalAssignee(tx, target)) {
        if (!preserveForPatient) return null;
        const current = await tx.patient.findUnique({ where: { id: preserveForPatient }, select: { assignedProfessionalId: true } });
        if (current?.assignedProfessionalId !== target) return null;
        return write(tx, undefined);
      }
      return write(tx, target);
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2034") return null;
    throw e;
  }
}
