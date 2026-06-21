import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal, startOfDayUtc } from "@/lib/ceo-personal";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * GET /api/ceo/journal?date=YYYY-MM-DD (opcional, default hoy)
 * o /api/ceo/journal?range=7  (últimos N días, máx 60)
 */
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();

  const rangeStr = req.nextUrl.searchParams.get("range");
  if (rangeStr) {
    const range = Math.min(Math.max(Number(rangeStr) || 7, 1), 60);
    const since = new Date();
    since.setDate(since.getDate() - range);
    const entries = await prisma.ceoJournalEntry.findMany({
      where: { professionalId: user.id, date: { gte: startOfDayUtc(since) } },
      orderBy: { date: "desc" },
    });
    return NextResponse.json({ entries });
  }

  const dateStr = req.nextUrl.searchParams.get("date");
  const date = dateStr ? startOfDayUtc(new Date(dateStr)) : startOfDayUtc();
  const entry = await prisma.ceoJournalEntry.findUnique({
    where: { professionalId_date: { professionalId: user.id, date } },
  });
  return NextResponse.json({ entry, date: date.toISOString() });
}

/**
 * PUT /api/ceo/journal
 * Body: { date: "YYYY-MM-DD", content }
 * Upsert por (professionalId, date).
 */
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const date = data?.date ? startOfDayUtc(new Date(data.date)) : startOfDayUtc();
  const content = typeof data?.content === "string" ? data.content : "";

  const entry = await prisma.ceoJournalEntry.upsert({
    where: { professionalId_date: { professionalId: user.id, date } },
    create: { professionalId: user.id, date, content },
    update: { content },
  });
  return NextResponse.json({ entry });
}
