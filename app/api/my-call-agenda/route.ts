/**
 * GET  /api/my-call-agenda — devuelve settings + availability del fisio logueado.
 * PUT  /api/my-call-agenda — actualiza settings (durationMin).
 *   Body: { optimizationDurationMin?: number; renewalDurationMin?: number }
 * POST /api/my-call-agenda/slot — añade una franja de disponibilidad.
 *   Body: { dayOfWeek: 1-7; startTime: "HH:mm"; endTime: "HH:mm" }
 * DELETE /api/my-call-agenda/slot?id=... — elimina una franja.
 *
 * Solo miembros del equipo con rol fisio/head_success/ceo. Cada uno gestiona
 * su propia agenda (no ve la de otros).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

async function requireStaff() {
  const user = await getActiveProfessional();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (!(user.role === "fisio" || user.role === "head_success" || user.role === "ceo")) {
    return { error: "Forbidden" as const, status: 403 };
  }
  return { user };
}

export async function GET() {
  const g = await requireStaff();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const [settings, availability] = await Promise.all([
    (prisma as any).professionalCallSettings.findUnique({ where: { professionalId: g.user.id } }),
    (prisma as any).professionalCallAvailability.findMany({
      where: { professionalId: g.user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
  ]);

  return NextResponse.json({
    settings: {
      optimizationDurationMin: settings?.optimizationDurationMin ?? 45,
      renewalDurationMin: settings?.renewalDurationMin ?? 45,
    },
    availability,
  });
}

export async function PUT(req: NextRequest) {
  const g = await requireStaff();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if (Number.isInteger(b?.optimizationDurationMin) && b.optimizationDurationMin >= 5 && b.optimizationDurationMin <= 240) {
    data.optimizationDurationMin = b.optimizationDurationMin;
  }
  if (Number.isInteger(b?.renewalDurationMin) && b.renewalDurationMin >= 5 && b.renewalDurationMin <= 240) {
    data.renewalDurationMin = b.renewalDurationMin;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const settings = await (prisma as any).professionalCallSettings.upsert({
    where: { professionalId: g.user.id },
    create: { professionalId: g.user.id, ...data },
    update: data,
  });
  return NextResponse.json({ settings });
}
