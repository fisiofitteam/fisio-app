import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { currentQuarterLabel } from "@/lib/quarter";

/**
 * GET  /api/quarterly-objective  → devuelve el objetivo del trimestre
 *   actual (calculado en TZ Madrid). null si aún no está definido.
 * PUT  /api/quarterly-objective  → crea o actualiza el objetivo del
 *   trimestre actual. Solo CEO.
 *
 * Guardamos una fila por trimestre (`quarter` @unique). Al cambiar de
 * trimestre se crea automáticamente uno nuevo la primera vez que el CEO
 * lo edite — el trimestre anterior queda como histórico consultable si
 * se hace GET pasándole `?quarter=YYYY-Qn` (no expuesto en UI aún).
 */

const FIELDS = ["mainTheme", "focusMarketing", "focusSales", "focusService", "focusCeo"] as const;
type Field = typeof FIELDS[number];

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Por ahora solo CEO ve el objetivo del trimestre en el panel.
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const quarterParam = url.searchParams.get("quarter");
  const quarter = quarterParam && /^\d{4}-Q[1-4]$/.test(quarterParam)
    ? quarterParam
    : currentQuarterLabel();

  const objective = await prisma.quarterlyObjective.findUnique({ where: { quarter } });
  return NextResponse.json({ quarter, objective });
}

export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede editar el objetivo del trimestre" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const values: Record<Field, string> = {} as any;
  for (const key of FIELDS) {
    const v = body?.[key];
    values[key] = typeof v === "string" ? v.trim().slice(0, 4000) : "";
  }

  const quarter = currentQuarterLabel();
  const objective = await prisma.quarterlyObjective.upsert({
    where: { quarter },
    create: { quarter, ...values, updatedById: user.id },
    update: { ...values, updatedById: user.id },
  });

  return NextResponse.json({ quarter, objective });
}
