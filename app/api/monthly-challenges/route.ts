import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

// GET /api/monthly-challenges?year=YYYY&month=0..11 — devuelve el reto del mes.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(req.nextUrl.searchParams.get("month") ?? new Date().getMonth());

  const challenge = await prisma.monthlyChallenge.findUnique({
    where: { year_month: { year, month } },
  });
  return NextResponse.json(challenge);
}

// POST /api/monthly-challenges — crea o actualiza (upsert) el reto del mes.
// body: { year, month, title, description?, metric? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const year = Number(b?.year);
  const month = Number(b?.month);
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11 || !title) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const description = typeof b?.description === "string" && b.description.trim() ? b.description.trim() : null;
  const metric = b?.metric === "time" ? "time" : "score";

  const saved = await prisma.monthlyChallenge.upsert({
    where: { year_month: { year, month } },
    create: { year, month, title, description, metric },
    update: { title, description, metric },
  });
  return NextResponse.json(saved);
}

// DELETE /api/monthly-challenges?id=xxx
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.monthlyChallenge.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
