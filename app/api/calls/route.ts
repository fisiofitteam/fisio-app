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
  // CEO y head_success pueden borrar llamadas — el resto usa "✓ Hecha"
  // para cerrarlas sin destruir el historial (avisos del cron, resúmenes
  // IA, respuestas del formulario previo).
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Solo CEO o head coach pueden borrar llamadas" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // 1) Borra el PatientCall enlazado por scheduledCallId (con formResponse
  //    en cascada) y el ScheduledCall en sí.
  // 2) Además, como red de seguridad para llamadas huérfanas de pruebas
  //    (creadas antes del fix que enlaza al reservar), busca un PatientCall
  //    del mismo paciente + mismo tipo con scheduledAt idéntico al del
  //    ScheduledCall y lo borra también. La coincidencia exacta de fecha
  //    evita falsos positivos entre múltiples llamadas del mismo paciente.
  //
  // El evento de Google Calendar NO se cancela — requiere refresh token y
  // añade puntos de fallo. El usuario lo borra a mano si le molesta.
  const scheduled = await prisma.scheduledCall.findUnique({
    where: { id },
    select: { patientId: true, type: true, scheduledAt: true },
  });

  await prisma.patientCall.deleteMany({ where: { scheduledCallId: id } });
  await prisma.scheduledCall.delete({ where: { id } });

  if (scheduled?.scheduledAt) {
    const patientCallType = scheduled.type === "renovacion" ? "renewal" : "optimization";
    await prisma.patientCall.deleteMany({
      where: {
        patientId: scheduled.patientId,
        type: patientCallType,
        scheduledAt: scheduled.scheduledAt,
        scheduledCallId: null, // solo huérfanos: los enlazados ya cayeron arriba
      },
    });
  }

  return NextResponse.json({ ok: true });
}
