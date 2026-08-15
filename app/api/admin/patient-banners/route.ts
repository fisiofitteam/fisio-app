/**
 * GET  /api/admin/patient-banners — lista de banners con stats de dismissals.
 * POST /api/admin/patient-banners — crea un banner.
 *
 * Solo CEO / head_success. Body POST:
 *   { title, body, variant, targetProgramTypes: string[], startsAt, endsAt, dismissible }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

const VALID_VARIANTS = ["info", "warning", "success"] as const;
const VALID_PROGRAMS = ["RECUPERA", "CONSOLIDA", "ADVANCE", "PREVENTION"] as const;

async function requireManager() {
  const user = await getActiveProfessional();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (user.role !== "ceo" && user.role !== "head_success") return { error: "Forbidden" as const, status: 403 };
  return { user };
}

export async function GET() {
  const g = await requireManager();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const banners = await (prisma as any).patientBanner.findMany({
    orderBy: [{ startsAt: "desc" }],
    include: {
      createdBy: { select: { fullName: true } },
      _count: { select: { dismissals: true } },
    },
  });
  return NextResponse.json({ banners });
}

export async function POST(req: NextRequest) {
  const g = await requireManager();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = await req.json().catch(() => ({}));

  const title = String(b?.title ?? "").trim();
  const body = String(b?.body ?? "").trim();
  const variant = VALID_VARIANTS.includes(b?.variant) ? b.variant : "info";
  const programs = Array.isArray(b?.targetProgramTypes)
    ? b.targetProgramTypes.filter((p: any) => VALID_PROGRAMS.includes(p))
    : [];
  const startsAt = b?.startsAt ? new Date(b.startsAt) : null;
  const endsAt = b?.endsAt ? new Date(b.endsAt) : null;
  const dismissible = b?.dismissible !== false;

  if (!title) return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "El mensaje es obligatorio" }, { status: 400 });
  if (!startsAt || !endsAt || isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }
  if (endsAt <= startsAt) {
    return NextResponse.json({ error: "La fecha de fin debe ser posterior a la de inicio" }, { status: 400 });
  }

  const banner = await (prisma as any).patientBanner.create({
    data: {
      title,
      body,
      variant,
      targetProgramTypes: JSON.stringify(programs),
      startsAt,
      endsAt,
      dismissible,
      createdByProfessionalId: g.user.id,
    },
  });
  return NextResponse.json({ banner });
}
