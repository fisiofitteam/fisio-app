import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal, currentYearMonth } from "@/lib/ceo-personal";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * GET /api/ceo/focus?year=&month=
 * Devuelve el foco del mes (o el actual si no se especifica).
 */
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();

  const yearStr = req.nextUrl.searchParams.get("year");
  const monthStr = req.nextUrl.searchParams.get("month");
  const now = currentYearMonth();
  const year = yearStr ? Number(yearStr) : now.year;
  const month = monthStr ? Number(monthStr) : now.month;

  const focus = await prisma.ceoFocus.findUnique({
    where: { professionalId_year_month: { professionalId: user.id, year, month } },
  });
  return NextResponse.json({ focus, year, month });
}

/**
 * PUT /api/ceo/focus
 * Body: { year, month, content }
 * Upsert del foco para ese mes.
 */
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();

  const data = await req.json().catch(() => ({}));
  const now = currentYearMonth();
  const year = Number(data?.year ?? now.year);
  const month = Number(data?.month ?? now.month);
  const content = typeof data?.content === "string" ? data.content : "";

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
  }

  const focus = await prisma.ceoFocus.upsert({
    where: { professionalId_year_month: { professionalId: user.id, year, month } },
    create: { professionalId: user.id, year, month, content },
    update: { content },
  });
  return NextResponse.json({ focus });
}
