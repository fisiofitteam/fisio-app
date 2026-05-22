/**
 * Migración one-shot: para los ADVANCE existentes que tienen `rollingProgramId`
 * pero ningún slot nuevo asignado, copiamos el legacy al slot de "Entrenamiento".
 *
 * Idempotente. Solo afecta a pacientes que están en el limbo entre v48 y v49.
 *
 * Solo CEO/Head_success pueden ejecutarlo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ADVANCE con rolling legacy pero sin slots nuevos
  const candidates = await prisma.patient.findMany({
    where: {
      programType: "ADVANCE",
      programMode: "rolling",
      rollingProgramId: { not: null },
      rollingTrainingId: null,
      rollingAccessoriesId: null,
    },
    select: { id: true, fullName: true, rollingProgramId: true },
  });

  let migrated = 0;
  for (const p of candidates) {
    await prisma.patient.update({
      where: { id: p.id },
      data: { rollingTrainingId: p.rollingProgramId },
    });
    migrated++;
  }

  return NextResponse.json({
    ok: true,
    migrated,
    note: "Los ADVANCE existentes han recibido su programa Rolling antiguo como 'Entrenamiento'. El slot 'Accesorios' queda vacío para que lo asignes manualmente.",
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
