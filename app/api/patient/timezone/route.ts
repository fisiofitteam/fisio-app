/**
 * POST /api/patient/timezone { timezone }
 * Guarda la zona horaria IANA detectada del navegador del paciente. Se
 * llama desde PatientShell al montar si el valor detectado difiere del
 * guardado (idempotente — sin body no hace nada).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

// Whitelist ligera: solo aceptamos IANA-like ("Region/City") para no
// permitir strings arbitrarios en la BD.
function isValidTz(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 60) return false;
  if (!/^[A-Za-z_]+\/[A-Za-z_\-/]+$/.test(s)) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: s });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { timezone } = await req.json().catch(() => ({}));
  if (!isValidTz(timezone)) {
    return NextResponse.json({ error: "TZ no válida" }, { status: 400 });
  }

  await prisma.patient.update({
    where: { id: patient.id },
    data: { timezone },
  });
  return NextResponse.json({ ok: true });
}
