/**
 * GET /api/patients/[id]/metrics
 *
 * Lista de métricas disponibles para el paciente — es lo que el fisio ve al
 * configurar una tarea EVOLUTION en el calendario del paciente. Incluye:
 *   - Las globales activas (materializadas como PatientMetric isPreset=true)
 *   - Las custom añadidas manualmente al paciente (isPreset=false)
 *
 * Antes de leer llama a materializePatientMetrics() para asegurar que las
 * globales están sincronizadas.
 *
 * POST /api/patients/[id]/metrics
 *
 * Crea una métrica custom para ese paciente (name + unit opcional). Devuelve
 * la métrica creada para que el editor la seleccione automáticamente.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { materializePatientMetrics } from "@/lib/metric-definitions";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await materializePatientMetrics(params.id);

  const metrics = await prisma.patientMetric.findMany({
    where: { patientId: params.id, isVisible: true },
    orderBy: [{ isPreset: "desc" }, { order: "asc" }, { createdAt: "asc" }],
    select: { id: true, key: true, name: true, unit: true, isPreset: true },
  });

  return NextResponse.json({ metrics });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, unit } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const count = await prisma.patientMetric.count({ where: { patientId: params.id } });
  const key = `custom_${Date.now()}`;
  const metric = await prisma.patientMetric.create({
    data: {
      patientId: params.id,
      key,
      name: name.trim(),
      unit: unit?.trim() || null,
      isPreset: false,
      isVisible: true,
      order: count,
    },
    select: { id: true, key: true, name: true, unit: true, isPreset: true },
  });

  return NextResponse.json({ metric });
}
