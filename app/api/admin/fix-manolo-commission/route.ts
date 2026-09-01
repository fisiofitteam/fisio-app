/**
 * POST /api/admin/fix-manolo-commission
 *
 * Script ONE-SHOT: revierte la exclusion de comisión aplicada por
 * accidente sobre la renovación CONSOLIDA 6m de Manolo Gonzalez Carmona.
 *
 * - Restaura amountPaid a 997.02€ (166,17€ × 6 cuotas).
 * - Quita la marca " · Comisión ya liquidada directamente por CEO" de notes.
 *
 * Idempotente: si el amountPaid ya no es null, no vuelve a tocar.
 * Solo CEO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

const RENEWAL_ID = "cmsi14wvd0007gos1ba8yrdqt";
const CORRECT_AMOUNT = 997.02; // 166.17 x 6
const MARKER = " · Comisión ya liquidada directamente por CEO";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await prisma.subscriptionRenewal.findUnique({
    where: { id: RENEWAL_ID },
    select: { id: true, amountPaid: true, notes: true },
  });
  if (!row) return NextResponse.json({ error: "Renewal no encontrado" }, { status: 404 });

  if (row.amountPaid !== null) {
    return NextResponse.json({
      ok: false,
      alreadyFixed: true,
      currentAmountPaid: row.amountPaid,
      currentNotes: row.notes,
    });
  }

  const cleanedNotes = (row.notes ?? "").replace(MARKER, "").trim() || null;

  const updated = await prisma.subscriptionRenewal.update({
    where: { id: RENEWAL_ID },
    data: {
      amountPaid: CORRECT_AMOUNT,
      notes: cleanedNotes,
    },
    select: { id: true, amountPaid: true, notes: true },
  });

  return NextResponse.json({
    ok: true,
    restored: updated,
  });
}
