/**
 * Backfill: recorre los pacientes con anamnesisData JSON y, si tienen
 * bodyZones[]/bodySides[] rellenos pero patient.bodyZone vacío, lo regenera
 * usando summarizeBodyZone(). Sirve para arreglar los pacientes que
 * rellenaron la anamnesis antes de que existiera el cache denormalizado.
 *
 * POST /api/admin/backfill-body-zone
 *
 * Solo CEO o head success pueden ejecutarlo. Idempotente: no pisa bodyZone
 * si ya tiene contenido.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { summarizeBodyZone } from "@/lib/onboarding-content";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const candidates = await prisma.patient.findMany({
    where: {
      anamnesisData: { not: null },
      OR: [{ bodyZone: null }, { bodyZone: "" }],
    },
    select: { id: true, fullName: true, anamnesisData: true },
  });

  const updated: { id: string; fullName: string; bodyZone: string }[] = [];
  const skipped: { id: string; fullName: string; reason: string }[] = [];

  for (const p of candidates) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(p.anamnesisData!);
    } catch {
      skipped.push({ id: p.id, fullName: p.fullName, reason: "anamnesisData no es JSON válido" });
      continue;
    }
    const summary = summarizeBodyZone(parsed);
    if (!summary) {
      skipped.push({ id: p.id, fullName: p.fullName, reason: "anamnesis sin bodyZones" });
      continue;
    }
    await prisma.patient.update({
      where: { id: p.id },
      data: { bodyZone: summary },
    });
    updated.push({ id: p.id, fullName: p.fullName, bodyZone: summary });
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    updatedCount: updated.length,
    skippedCount: skipped.length,
    updated,
    skipped,
  });
}
