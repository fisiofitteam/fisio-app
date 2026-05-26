// Métricas generales (definidas por el CEO) y su materialización por paciente.
import { prisma } from "@/lib/prisma";

// Métricas por defecto (se rellenan automáticamente al completar sesiones).
export const DEFAULT_METRIC_DEFINITIONS = [
  { key: "pain", name: "Dolor", unit: "0-10", auto: true, order: 0 },
  { key: "rpe", name: "RPE percibido", unit: "0-10", auto: true, order: 1 },
  { key: "stiffness", name: "Rigidez", unit: "0-10", auto: true, order: 2 },
];

// Devuelve las definiciones (sembrando las por defecto si no hay ninguna).
export async function getMetricDefinitions() {
  let defs = await prisma.metricDefinition.findMany({ orderBy: { order: "asc" } });
  if (defs.length === 0) {
    await prisma.metricDefinition.createMany({ data: DEFAULT_METRIC_DEFINITIONS });
    defs = await prisma.metricDefinition.findMany({ orderBy: { order: "asc" } });
  }
  return defs;
}

// Asegura que el paciente tiene un PatientMetric por cada métrica general activa
// (así aparecen en su evolución aunque no haya datos). Oculta las inactivas.
export async function materializePatientMetrics(patientId: string): Promise<void> {
  const defs = await getMetricDefinitions();
  for (const d of defs) {
    if (d.active) {
      await prisma.patientMetric.upsert({
        where: { patientId_key: { patientId, key: d.key } },
        create: { patientId, key: d.key, name: d.name, unit: d.unit, isPreset: true, isVisible: true, order: d.order },
        update: { name: d.name, unit: d.unit, isVisible: true, order: d.order, isPreset: true },
      });
    } else {
      await prisma.patientMetric.updateMany({ where: { patientId, key: d.key }, data: { isVisible: false } });
    }
  }
}
