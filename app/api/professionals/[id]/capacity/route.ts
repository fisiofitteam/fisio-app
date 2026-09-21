import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * POST /api/professionals/[id]/capacity
 *   body: { maxPatients: number | null }
 *
 * Sobreescribe el máximo de pacientes del coach. null o "" limpia el
 * override y hace que use el default global de OpsConfig.
 *
 * Solo CEO y head_success.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = body?.maxPatients;

  let maxPatients: number | null;
  if (raw === null || raw === undefined || raw === "") {
    maxPatients = null;
  } else {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      return NextResponse.json(
        { error: "maxPatients debe estar entre 0 y 1000 (o null para usar el global)" },
        { status: 400 },
      );
    }
    maxPatients = n;
  }

  const updated = await prisma.professional.update({
    where: { id: params.id },
    data: { maxPatients },
    select: { id: true, maxPatients: true },
  });

  return NextResponse.json({ ok: true, professional: updated });
}
