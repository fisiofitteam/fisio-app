import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const { id, ...rest } = data;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const update: any = {};

  // Campos directos
  const textFields = [
    "title", "hook", "caption",
    "format", "goal", "ctaType",
    "recordingLocation", "recordingOutfit", "recordingMaterial",
    "editorNotes", "finalFileUrl", "dmKeyword", "status",
  ];
  for (const k of textFields) {
    if (rest[k] !== undefined) update[k] = rest[k] || null;
  }

  if (rest.consentSigned !== undefined) update.consentSigned = !!rest.consentSigned;

  // Blocks: viene como array, lo guardamos como JSON string
  if (rest.blocks !== undefined) {
    update.blocks = JSON.stringify(rest.blocks);
  }

  // Goals: array de objetivos (selección múltiple). Validamos los valores.
  if (rest.goals !== undefined) {
    const validGoals = ["atraer", "conectar", "educar", "convertir", "lanzamiento"];
    const goalsArr = Array.isArray(rest.goals) ? rest.goals.filter((g: any) => validGoals.includes(g)) : [];
    update.goals = JSON.stringify(goalsArr);
  }

  // Métricas
  const metricFields = [
    "metricsReach", "metricsSaves", "metricsShares",
    "metricsComments", "metricsDmKeyword", "metricsConversions",
  ];
  let touchedMetrics = false;
  for (const k of metricFields) {
    if (rest[k] !== undefined) {
      update[k] = rest[k] === "" || rest[k] === null ? null : Number(rest[k]);
      touchedMetrics = true;
    }
  }
  if (touchedMetrics) update.metricsFilledAt = new Date();
  if (rest.clearMetricsFilledAt) update.metricsFilledAt = null;

  const piece = await prisma.contentPiece.update({ where: { id }, data: update });
  return NextResponse.json(piece);
}
