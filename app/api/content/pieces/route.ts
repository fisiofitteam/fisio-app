import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

/**
 * POST /api/content/pieces — crear una pieza nueva dentro de una semana.
 * Hasta ahora solo se podían crear las 7 al crear la semana; este endpoint
 * permite añadir piezas adicionales (más de una por día, días extra, etc).
 *
 * Body:
 *  - weekId      (string, obligatorio)
 *  - dayOfWeek   (1-7, obligatorio)
 *  - format      (string, opcional → vacío)
 *  - title       (string, opcional)
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json().catch(() => ({}));
  const weekId = typeof data?.weekId === "string" ? data.weekId.trim() : "";
  const dayOfWeek = Number(data?.dayOfWeek);
  if (!weekId) return NextResponse.json({ error: "weekId requerido" }, { status: 400 });
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return NextResponse.json({ error: "dayOfWeek debe ser 1..7" }, { status: 400 });
  }

  // Validamos que la semana exista. Aprovechamos para coger leadMagnetKeyword
  // y prefijar dmKeyword igual que se hace al crear las 7 iniciales.
  const week = await prisma.contentWeek.findUnique({
    where: { id: weekId },
    select: { id: true, leadMagnetKeyword: true },
  });
  if (!week) return NextResponse.json({ error: "Semana no encontrada" }, { status: 404 });

  const piece = await prisma.contentPiece.create({
    data: {
      weekId: week.id,
      dayOfWeek,
      format: typeof data?.format === "string" ? data.format : "",
      goal: "",
      goals: "[]",
      ctaType: "",
      dmKeyword: week.leadMagnetKeyword ?? null,
      title: typeof data?.title === "string" && data.title.trim() ? data.title.trim() : null,
      blocks: "[]",
      status: "idea",
    },
  });

  return NextResponse.json({ ok: true, piece });
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

  // Mover de día/semana (drag & drop en calendario)
  if (rest.dayOfWeek !== undefined) {
    const dow = Number(rest.dayOfWeek);
    if (dow < 1 || dow > 7) {
      return NextResponse.json({ error: "dayOfWeek debe ser 1-7" }, { status: 400 });
    }
    update.dayOfWeek = dow;
  }
  if (rest.weekId !== undefined) {
    // Verificar que la semana destino existe
    const targetWeek = await prisma.contentWeek.findUnique({ where: { id: rest.weekId } });
    if (!targetWeek) {
      return NextResponse.json({ error: "Semana destino no existe" }, { status: 400 });
    }
    update.weekId = rest.weekId;
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
