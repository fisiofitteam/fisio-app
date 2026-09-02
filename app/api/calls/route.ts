import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { patientId, scheduledAt, type, notes } = await req.json();
  const c = await prisma.scheduledCall.create({
    data: {
      patientId,
      // scheduledAt es opcional: null = "pendiente de agendar".
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      type: type || "optimizacion",
      notes: notes || null,
    },
  });
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest) {
  const { id, completedAt, outcome, notes, scheduledAt, type } = await req.json();
  const c = await prisma.scheduledCall.update({
    where: { id },
    data: {
      ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
      ...(outcome !== undefined && { outcome: outcome || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
      ...(type !== undefined && { type }),
    },
  });
  return NextResponse.json(c);
}

export async function DELETE(req: NextRequest) {
  // Solo el CEO puede borrar llamadas — el resto usa "✓ Hecha" para
  // cerrarlas sin destruir el historial (avisos del cron, resúmenes IA,
  // respuestas del formulario previo).
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede borrar llamadas" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Borramos también los PatientCall enlazados (con su formResponse en
  // cascada) para dejar el historial limpio. El evento de Google Calendar
  // asociado no se cancela — hacerlo requeriría llamadas al API con
  // refresh token y riesgo de fallo silencioso. El CEO lo borra a mano en
  // Calendar si le molesta.
  await prisma.patientCall.deleteMany({ where: { scheduledCallId: id } });
  await prisma.scheduledCall.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
