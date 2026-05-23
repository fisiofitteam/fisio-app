/**
 * POST /api/admin/seed-default-template
 *
 * Endpoint one-shot para migración v56: copia las franjas de la semana actual
 * (de ClosingShift) a DefaultClosingShift, creando así la plantilla por defecto
 * con los closers ya asignados.
 *
 * NO destructivo: si ya hay plantilla, no hace nada.
 *
 * Solo CEO puede ejecutarlo.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartOf } from "@/lib/agendaTemplate";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  // Si ya hay plantilla, no hacer nada
  const existing = await prisma.defaultClosingShift.count();
  if (existing > 0) {
    return NextResponse.json({
      ok: true,
      message: `Ya hay ${existing} franjas en la plantilla. No se ha modificado nada.`,
      shifts: existing,
    });
  }

  // Buscar la semana actual y copiar sus franjas
  const ws = weekStartOf(new Date());
  const current = await prisma.closingShift.findMany({ where: { weekStartDate: ws } });

  // Si no hay franjas en la semana actual, copiar valores hardcoded de FisioFit
  if (current.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No hay franjas en la semana actual para usar como plantilla. Configúralas primero en 'Por semana'.",
    });
  }

  // Crear plantilla a partir de la semana actual
  await prisma.defaultClosingShift.createMany({
    data: current.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      closerId: s.closerId,
    })),
  });

  return NextResponse.json({
    ok: true,
    message: `Plantilla creada con ${current.length} franjas copiadas de la semana actual.`,
    shifts: current.length,
  });
}
