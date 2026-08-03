/**
 * CRUD de CarouselVisualTemplate — plantillas visuales del equipo. Guardas
 * el slide activo con "guardar como plantilla" y desde otro slide "aplicar
 * plantilla" copia el estilo (posiciones, colores, fuentes) rellenando
 * con el texto del slide destino.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// GET /api/carousel-maker/templates
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const list = await (prisma as any).carouselVisualTemplate.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(list);
}

// POST /api/carousel-maker/templates
// body: { name, description?, slideJson }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Ponle un nombre a la plantilla." }, { status: 400 });
  if (typeof b.slideJson !== "string") return NextResponse.json({ error: "Falta slideJson." }, { status: 400 });
  try { JSON.parse(b.slideJson); } catch {
    return NextResponse.json({ error: "slideJson no es JSON válido." }, { status: 400 });
  }
  const tpl = await (prisma as any).carouselVisualTemplate.create({
    data: {
      name,
      description: typeof b.description === "string" ? b.description.trim() : null,
      slideJson: b.slideJson,
      createdById: user.id,
    },
  });
  return NextResponse.json(tpl);
}

// PATCH /api/carousel-maker/templates
// body: { id, name?, description?, slideJson? }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  if (!b?.id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  const data: any = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.description === "string") data.description = b.description.trim();
  if (typeof b.slideJson === "string") {
    try { JSON.parse(b.slideJson); data.slideJson = b.slideJson; }
    catch { return NextResponse.json({ error: "slideJson inválido." }, { status: 400 }); }
  }
  const tpl = await (prisma as any).carouselVisualTemplate.update({ where: { id: b.id }, data });
  return NextResponse.json(tpl);
}

// DELETE /api/carousel-maker/templates?id=xxx
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  await (prisma as any).carouselVisualTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
