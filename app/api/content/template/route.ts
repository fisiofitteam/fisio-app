/**
 * GET    /api/content/template       → devuelve los 7 días de la plantilla
 * PATCH  /api/content/template       → actualiza un día (body: { dayOfWeek, format, goal, ctaType, defaultDmKeyword, blocks, storyChecklist })
 *
 * Permisos: solo CEO puede editar. GET es accesible para ceo y setter.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function canRead(role: string) {
  return role === "ceo" || role === "setter";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canRead(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = await prisma.contentTemplateDay.findMany({
    orderBy: { dayOfWeek: "asc" },
  });

  return NextResponse.json({
    days: days.map((d) => ({
      id: d.id,
      dayOfWeek: d.dayOfWeek,
      format: d.format,
      goal: d.goal,
      ctaType: d.ctaType,
      defaultDmKeyword: d.defaultDmKeyword,
      goals: (() => { try { return JSON.parse(d.goals); } catch { return []; } })(),
      blocks: JSON.parse(d.blocks),
      storyChecklist: JSON.parse(d.storyChecklist),
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO puede editar la plantilla" }, { status: 403 });
  }

  const data = await req.json();
  const dayOfWeek = Number(data.dayOfWeek);
  if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 7) {
    return NextResponse.json({ error: "dayOfWeek debe ser 1-7" }, { status: 400 });
  }

  const update: any = { updatedById: user.id };
  if (data.format !== undefined) update.format = String(data.format);
  if (data.goal !== undefined) update.goal = String(data.goal);
  if (data.ctaType !== undefined) update.ctaType = String(data.ctaType);
  if (data.defaultDmKeyword !== undefined) update.defaultDmKeyword = String(data.defaultDmKeyword);
  if (data.goals !== undefined) {
    const validGoals = ["atraer", "conectar", "educar", "convertir", "lanzamiento"];
    const goalsArr = Array.isArray(data.goals) ? data.goals.filter((g: any) => validGoals.includes(g)) : [];
    update.goals = JSON.stringify(goalsArr);
  }
  if (data.blocks !== undefined) {
    // Aceptamos array u objeto; normalizamos a array de {id, label, order}
    if (!Array.isArray(data.blocks)) {
      return NextResponse.json({ error: "blocks debe ser un array" }, { status: 400 });
    }
    const normalized = data.blocks.map((b: any, idx: number) => ({
      id: String(b.id || `block_${idx}`),
      label: String(b.label || ""),
      order: typeof b.order === "number" ? b.order : idx,
    }));
    update.blocks = JSON.stringify(normalized);
  }
  if (data.storyChecklist !== undefined) {
    if (!Array.isArray(data.storyChecklist)) {
      return NextResponse.json({ error: "storyChecklist debe ser un array" }, { status: 400 });
    }
    update.storyChecklist = JSON.stringify(data.storyChecklist.map((s: any) => String(s)));
  }

  const updated = await prisma.contentTemplateDay.update({
    where: { dayOfWeek },
    data: update,
  });

  return NextResponse.json({
    ok: true,
    day: {
      id: updated.id,
      dayOfWeek: updated.dayOfWeek,
      format: updated.format,
      goal: updated.goal,
      ctaType: updated.ctaType,
      defaultDmKeyword: updated.defaultDmKeyword,
      goals: (() => { try { return JSON.parse(updated.goals); } catch { return []; } })(),
      blocks: JSON.parse(updated.blocks),
      storyChecklist: JSON.parse(updated.storyChecklist),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
