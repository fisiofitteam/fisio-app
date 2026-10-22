import { NextResponse } from "next/server";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { refreshPatientWeek, weekStartUtc } from "@/lib/weekly-reports";
export const maxDuration = 120;
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (typeof b.patientId !== "string" || !await canAccessEvidencePatient(b.patientId)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (typeof b.week !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.week)) return NextResponse.json({ error: "Semana no válida" }, { status: 400 });
  const date = new Date(b.week + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date > new Date() || date.toISOString().slice(0,10) !== b.week) return NextResponse.json({ error: "Semana no válida" }, { status: 400 });
  try {
    await refreshPatientWeek(b.patientId, weekStartUtc(date));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar el resumen. Inténtalo de nuevo." }, { status: 500 });
  }
}
