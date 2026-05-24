import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { isoWeekRange } from "@/lib/content-templates";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const year = Number(data.year);
  const weekNumber = Number(data.weekNumber);
  if (!year || !weekNumber) {
    return NextResponse.json({ error: "year y weekNumber requeridos" }, { status: 400 });
  }

  // ¿Ya existe esa semana?
  const existing = await prisma.contentWeek.findFirst({ where: { year, weekNumber } });
  if (existing) {
    return NextResponse.json({ error: "Esa semana ya existe", weekId: existing.id }, { status: 409 });
  }

  const { start, end } = isoWeekRange(year, weekNumber);

  // Crear semana
  const week = await prisma.contentWeek.create({
    data: {
      year,
      weekNumber,
      startDate: start,
      endDate: end,
      centralTheme: data.centralTheme ?? "",
      bodyZone: data.bodyZone ?? "mixta",
      weekType: data.weekType ?? "educativa",
      limitingBeliefs: JSON.stringify(data.limitingBeliefs ?? []),
      leadMagnetName: data.leadMagnetName || null,
      leadMagnetKeyword: data.leadMagnetKeyword || null,
      commercialTrigger: data.commercialTrigger || null,
      previousWeekConnection: data.previousWeekConnection || null,
      nextWeekSetup: data.nextWeekSetup || null,
      mixValue: Number(data.mixValue ?? 50),
      mixBeliefs: Number(data.mixBeliefs ?? 30),
      mixConversion: Number(data.mixConversion ?? 20),
      kpiName: data.kpiName || null,
      kpiTarget: data.kpiTarget != null ? Number(data.kpiTarget) : null,
      status: "planning",
    },
  });

  // Generar las 7 piezas. Si llega `weeklyTemplateId`, se aplican los datos de
  // esa plantilla (titulo, formato y objetivos por dia). Si no, se crean vacias.
  const weeklyTemplateId = data.weeklyTemplateId ? String(data.weeklyTemplateId) : null;

  let templateDays: Array<{ dayOfWeek: number; title: string; format: string; goals: string[] }> = [];
  if (weeklyTemplateId) {
    const tpl = await prisma.weeklyTemplate.findUnique({ where: { id: weeklyTemplateId } });
    if (tpl) {
      try {
        const parsed = JSON.parse(tpl.days);
        if (Array.isArray(parsed)) templateDays = parsed;
      } catch {}
    }
  }
  const tplByDow: Record<number, { dayOfWeek: number; title: string; format: string; goals: string[] }> = {};
  for (const d of templateDays) tplByDow[d.dayOfWeek] = d;

  for (let dow = 1; dow <= 7; dow++) {
    const tplDay = tplByDow[dow];
    await prisma.contentPiece.create({
      data: {
        weekId: week.id,
        dayOfWeek: dow,
        format: tplDay?.format || "",
        goal: "",
        goals: tplDay?.goals ? JSON.stringify(tplDay.goals) : "[]",
        ctaType: "",
        dmKeyword: data.leadMagnetKeyword ?? null,
        title: tplDay?.title || null,
        blocks: "[]",
        status: "idea",
      },
    });
  }

  return NextResponse.json({ id: week.id });
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
  const passthrough = [
    "centralTheme", "bodyZone", "weekType", "leadMagnetName", "leadMagnetKeyword",
    "commercialTrigger", "previousWeekConnection", "nextWeekSetup",
    "kpiName", "status", "closingNotes", "winningHooks", "ideasEmerged",
  ];
  for (const k of passthrough) {
    if (rest[k] !== undefined) update[k] = rest[k] || null;
  }
  if (rest.limitingBeliefs !== undefined) update.limitingBeliefs = JSON.stringify(rest.limitingBeliefs);
  if (rest.mixValue !== undefined) update.mixValue = Number(rest.mixValue);
  if (rest.mixBeliefs !== undefined) update.mixBeliefs = Number(rest.mixBeliefs);
  if (rest.mixConversion !== undefined) update.mixConversion = Number(rest.mixConversion);
  if (rest.kpiTarget !== undefined) update.kpiTarget = rest.kpiTarget != null ? Number(rest.kpiTarget) : null;
  if (rest.status === "closed") update.closedAt = new Date();

  const week = await prisma.contentWeek.update({ where: { id }, data: update });
  return NextResponse.json(week);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.contentWeek.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
