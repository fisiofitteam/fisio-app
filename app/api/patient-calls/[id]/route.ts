import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * DELETE /api/patient-calls/[id]
 *
 * Borra un PatientCall desde la ficha del paciente. Solo CEO — el resto
 * del equipo usa el estado de la llamada para trabajar, no la elimina.
 *
 * Cascada: se elimina la PatientCallFormResponse (por la relación en el
 * schema) y también el ScheduledCall enlazado si existía — así la
 * eliminación queda simétrica con la del panel /fisio/llamadas.
 * El evento del Google Calendar no se cancela.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Solo CEO o head coach pueden borrar llamadas" }, { status: 403 });
  }

  const call = await prisma.patientCall.findUnique({
    where: { id: params.id },
    select: { id: true, scheduledCallId: true },
  });
  if (!call) return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });

  await prisma.patientCall.delete({ where: { id: call.id } });
  if (call.scheduledCallId) {
    // Best-effort: si ya no existe (borrado desde el panel de llamadas),
    // seguimos adelante sin romper la respuesta.
    await prisma.scheduledCall
      .delete({ where: { id: call.scheduledCallId } })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
