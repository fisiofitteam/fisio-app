import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const d = await req.json();
  const h = await prisma.winningHook.create({
    data: {
      text: d.text,
      format: d.format || null,
      bodyZone: d.bodyZone || null,
      weekId: d.weekId || null,
      reach: d.reach != null ? Number(d.reach) : null,
      saves: d.saves != null ? Number(d.saves) : null,
      dmKeyword: d.dmKeyword != null ? Number(d.dmKeyword) : null,
      conversions: d.conversions != null ? Number(d.conversions) : null,
      notes: d.notes || null,
    },
  });
  return NextResponse.json(h);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...rest } = await req.json();
  const update: any = {};
  for (const k of ["text", "format", "bodyZone", "notes"]) {
    if (rest[k] !== undefined) update[k] = rest[k] || null;
  }
  for (const k of ["reach", "saves", "dmKeyword", "conversions"]) {
    if (rest[k] !== undefined) update[k] = rest[k] === "" || rest[k] == null ? null : Number(rest[k]);
  }
  const h = await prisma.winningHook.update({ where: { id }, data: update });
  return NextResponse.json(h);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.winningHook.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
