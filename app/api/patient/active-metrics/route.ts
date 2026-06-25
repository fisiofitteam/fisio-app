/**
 * Devuelve las MetricDefinition activas marcadas como "auto" (= se piden al
 * paciente en cada sesión de evolución). Esto es lo que el CEO configura
 * desde Biblioteca → Métricas.
 *
 * Accesible al paciente logueado: usa la cookie de sesión paciente para
 * verificar acceso, pero no devuelve nada por-paciente; es la lista global.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";
import { getMetricDefinitions } from "@/lib/metric-definitions";

export const dynamic = "force-dynamic";

export async function GET() {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Asegura que existen (siembra las por defecto la primera vez).
  await getMetricDefinitions();
  const active = await prisma.metricDefinition.findMany({
    where: { auto: true, active: true },
    orderBy: { order: "asc" },
    select: { key: true, name: true, unit: true },
  });
  return NextResponse.json({ metrics: active });
}
