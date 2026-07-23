/**
 * GET /api/renewal-rates
 *   → lista todas las tarifas ordenadas por programType + periodMonths.
 *
 * POST /api/renewal-rates (solo CEO)
 *   body: { programType, periodMonths, amount, currency?, notes? }
 *   Upsert por (programType, periodMonths).
 *
 * DELETE /api/renewal-rates?id=... (solo CEO)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

const VALID_PROGRAMS = new Set(["RECUPERA", "CONSOLIDA", "ADVANCE", "PREVENTION"]);

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rates = await (prisma as any).renewalRate.findMany({
    orderBy: [{ programType: "asc" }, { periodMonths: "asc" }],
  });
  return NextResponse.json({ rates });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const programType = String(body?.programType ?? "").trim().toUpperCase();
  const periodMonths = Math.round(Number(body?.periodMonths));
  const amount = Number(body?.amount);
  const currency = String(body?.currency ?? "EUR").trim().toUpperCase();
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

  if (!VALID_PROGRAMS.has(programType)) {
    return NextResponse.json({ error: "programType inválido" }, { status: 400 });
  }
  if (!Number.isFinite(periodMonths) || periodMonths < 1 || periodMonths > 24) {
    return NextResponse.json({ error: "periodMonths inválido (1-24)" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "amount inválido" }, { status: 400 });
  }

  const saved = await (prisma as any).renewalRate.upsert({
    where: { programType_periodMonths: { programType, periodMonths } },
    create: {
      programType, periodMonths, amount, currency,
      notes: notes && notes.length > 0 ? notes : null,
      updatedById: user.id,
    },
    update: {
      amount, currency,
      notes: notes && notes.length > 0 ? notes : null,
      updatedById: user.id,
    },
  });
  return NextResponse.json({ rate: saved });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await (prisma as any).renewalRate.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
