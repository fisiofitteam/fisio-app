import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getMetricDefinitions } from "@/lib/metric-definitions";

function isCeo(role: string) {
  return role === "ceo";
}

// GET /api/metric-definitions — lista (siembra las por defecto si no hay).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !isCeo(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getMetricDefinitions());
}

// POST /api/metric-definitions — crea una métrica general. body: { name, unit? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !isCeo(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

  const last = await prisma.metricDefinition.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const created = await prisma.metricDefinition.create({
    data: {
      key: `metric_${Date.now()}`,
      name,
      unit: b?.unit?.trim() || null,
      auto: false,
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json(created);
}

// PATCH /api/metric-definitions — body: { id, name?, unit?, active?, order? }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !isCeo(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const data: any = {};
  if (typeof b?.name === "string") data.name = b.name.trim();
  if ("unit" in b) data.unit = b.unit?.trim() || null;
  if (typeof b?.active === "boolean") data.active = b.active;
  if (typeof b?.auto === "boolean") data.auto = b.auto;
  if (typeof b?.order === "number") data.order = b.order;

  const updated = await prisma.metricDefinition.update({ where: { id: b.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/metric-definitions?id=... — borra una métrica general (no las auto).
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !isCeo(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const def = await prisma.metricDefinition.findUnique({ where: { id } });
  if (!def) return NextResponse.json({ error: "No existe." }, { status: 404 });

  // Ocultar las copias ya materializadas en pacientes (conserva el histórico).
  await prisma.patientMetric.updateMany({ where: { key: def.key }, data: { isVisible: false } });
  await prisma.metricDefinition.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
