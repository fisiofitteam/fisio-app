import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import {
  WEEKLY_PLAN,
  FORMAT_TEMPLATES,
  isoWeekRange,
  type FormatKey,
} from "@/lib/content-templates";

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

  // Generar las 7 piezas usando WEEKLY_PLAN + FORMAT_TEMPLATES
  for (let dow = 1; dow <= 7; dow++) {
    const formatKey: FormatKey = WEEKLY_PLAN[dow];
    const tpl = FORMAT_TEMPLATES[formatKey];
    if (!tpl) continue;

    const scheduledDate = new Date(start);
    scheduledDate.setUTCDate(start.getUTCDate() + (dow - 1));
    scheduledDate.setUTCHours(19, 0, 0, 0); // 19:00 UTC default

    await prisma.contentPiece.create({
      data: {
        weekId: week.id,
        dayOfWeek: dow,
        format: formatKey,
        goal: tpl.goal,
        ctaType: tpl.ctaType,
        dmKeyword: tpl.defaultDmKeyword || (data.leadMagnetKeyword ?? null),
        blocks: JSON.stringify(tpl.blocks),
        scheduledAt: scheduledDate,
        status: "idea",
        supportStories: {
          create: tpl.storyChecklist.map((desc, idx) => ({
            order: idx,
            description: desc,
          })),
        },
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
