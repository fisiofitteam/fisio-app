"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getActiveProfessional } from "@/lib/session";

/**
 * Marca una sesion como "formulario revisado" (formReviewedAt=ahora).
 * Se dispara desde el recuadro del panel (/fisio) y desde el listado
 * completo (/fisio/formularios-pendientes). Ambos revalidan.
 *
 * Cualquier profesional autenticado puede — el flujo es que el fisio
 * asignado la revisa, pero managers tambien pueden dispensar en su
 * lugar sin fricciones.
 */
export async function markFormReviewed(sessionId: string): Promise<void> {
  const user = await getActiveProfessional();
  if (!user) return;
  await prisma.programSession.update({
    where: { id: sessionId },
    data: { formReviewedAt: new Date() },
  });
  revalidatePath("/fisio/formularios-pendientes");
  revalidatePath("/fisio");
}
