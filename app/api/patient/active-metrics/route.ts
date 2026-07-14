/**
 * Devuelve las métricas VISIBLES del paciente logueado — es lo que se pinta
 * al rellenar una tarea EVOLUTION en la sesión.
 *
 * Incluye las globales activas (materializadas como PatientMetric isPreset=true)
 * más las custom que el fisio haya añadido en la ficha clínica del paciente.
 *
 * Opcional (?keys=k1,k2,...): filtra al subconjunto pedido. Se usa cuando la
 * tarea EVOLUTION tiene metricSelection.mode='custom' — el runner solo quiere
 * mostrar las métricas concretas seleccionadas para esa sesión.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";
import { materializePatientMetrics } from "@/lib/metric-definitions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await materializePatientMetrics(patient.id);

  const keysParam = req.nextUrl.searchParams.get("keys");
  const wanted = keysParam ? keysParam.split(",").map((k) => k.trim()).filter(Boolean) : null;

  const metrics = await prisma.patientMetric.findMany({
    where: {
      patientId: patient.id,
      isVisible: true,
      ...(wanted ? { key: { in: wanted } } : {}),
    },
    orderBy: [{ isPreset: "desc" }, { order: "asc" }, { createdAt: "asc" }],
    select: { key: true, name: true, unit: true },
  });

  return NextResponse.json({ metrics });
}
