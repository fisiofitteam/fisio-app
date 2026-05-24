/**
 * GET    /api/weekly-templates              → lista todas las plantillas semanales
 * POST   /api/weekly-templates              → crea una nueva
 * PATCH  /api/weekly-templates              → actualiza una existente (id en body)
 * DELETE /api/weekly-templates?id=xxx       → borra
 *
 * Acceso: solo CEO crea/edita/borra. Setter y CEO pueden leer.
 *
 * Estructura del campo `days` (JSON string):
 *   [
 *     { dayOfWeek: 1, title: "", format: "reel", goals: ["atraer"] },
 *     ...7 entradas
 *   ]
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

const VALID_FORMATS = ["", "reel", "carousel", "infographic", "image", "live"];
const VALID_GOALS = ["atraer", "conectar", "educar", "convertir", "lanzamiento"];

function canRead(role: string) {
  return role === "ceo" || role === "setter";
}

type DayInput = { dayOfWeek?: number; title?: string; format?: string; goals?: string[] };

function normalizeDays(input: any): Array<{ dayOfWeek: number; title: string; format: string; goals: string[] }> {
  const arr = Array.isArray(input) ? input : [];
  const byDow = new Map<number, DayInput>();
  for (const d of arr) {
    if (d && typeof d.dayOfWeek === "number" && d.dayOfWeek >= 1 && d.dayOfWeek <= 7) {
      byDow.set(d.dayOfWeek, d);
    }
  }
  const result: Array<{ dayOfWeek: number; title: string; format: string; goals: string[] }> = [];
  for (let dow = 1; dow <= 7; dow++) {
    const d = byDow.get(dow) || {};
    const format = typeof d.format === "string" && VALID_FORMATS.includes(d.format) ? d.format : "";
    const goals = Array.isArray(d.goals) ? d.goals.filter((g: any) => VALID_GOALS.includes(g)) : [];
    result.push({
      dayOfWeek: dow,
      title: typeof d.title === "string" ? d.title : "",
      format,
      goals,
    });
  }
  return result;
}

function serialize(tpl: { id: string; name: string; description: string | null; days: string; updatedAt: Date }) {
  return {
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    days: JSON.parse(tpl.days),
    updatedAt: tpl.updatedAt.toISOString(),
  };
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canRead(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await prisma.weeklyTemplate.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ templates: templates.map(serialize) });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const data = await req.json();
  const name = String(data.name || "").trim();
  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 });

  const days = normalizeDays(data.days);

  const tpl = await prisma.weeklyTemplate.create({
    data: {
      name,
      description: data.description ? String(data.description) : null,
      days: JSON.stringify(days),
      createdById: user.id,
    },
  });

  return NextResponse.json({ template: serialize(tpl) });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const data = await req.json();
  const id = String(data.id || "");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const update: any = {};
  if (data.name !== undefined) update.name = String(data.name).trim();
  if (data.description !== undefined) update.description = data.description ? String(data.description) : null;
  if (data.days !== undefined) update.days = JSON.stringify(normalizeDays(data.days));

  const tpl = await prisma.weeklyTemplate.update({ where: { id }, data: update });
  return NextResponse.json({ template: serialize(tpl) });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.weeklyTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
