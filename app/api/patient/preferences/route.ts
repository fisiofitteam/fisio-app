/**
 * Preferencias del paciente (modifica campos del modelo Patient que el
 * propio paciente puede tocar).
 *
 * PATCH body: { dailyReminderEnabled?: boolean, ... }
 *
 * Auth: requiere sesión de paciente. Solo modifica el paciente propio.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

export async function PATCH(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const update: any = {};
  if (typeof data?.dailyReminderEnabled === "boolean") {
    update.dailyReminderEnabled = data.dailyReminderEnabled;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  await prisma.patient.update({ where: { id: patient.id }, data: update });
  return NextResponse.json({ ok: true });
}
