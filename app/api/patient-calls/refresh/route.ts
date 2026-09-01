/**
 * POST /api/patient-calls/refresh
 *
 * Disparo MANUAL del scheduler de llamadas de optimización/renovación,
 * accesible a cualquier miembro del equipo clínico (fisio / head_success
 * / ceo) desde el botón "Actualizar llamadas" del panel. Sirve como red
 * de seguridad cuando el cron programado falla o va con retraso.
 *
 * A diferencia de /api/cron/patient-calls-scheduler (que requiere
 * CRON_SECRET o ?manual=1 con rol manager), este endpoint acepta al
 * fisio de a pie porque el generador solo crea filas — no borra nada
 * y es idempotente (dedupe por count y ventana temporal).
 */
import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { schedulePatientCalls } from "@/lib/patient-calls-scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ceo", "head_success", "fisio"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await schedulePatientCalls();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[patient-calls/refresh]", e);
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
