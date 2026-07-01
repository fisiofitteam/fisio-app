/**
 * Diagnóstico de origen de un paciente.
 *
 * GET /api/admin/diagnose-patient?name=alberto
 *
 * Busca pacientes cuyo nombre contenga la cadena (case-insensitive) y
 * devuelve los indicadores clave para responder a "¿cómo lo dieron de
 * alta?". Pensado como herramienta de soporte para el CEO.
 *
 * Devuelve por cada match:
 *   - id, fullName, startedAt (cuándo se creó el registro)
 *   - subscriptionStartDate
 *   - giftsAlreadySent (true = alta como "📥 Paciente existente")
 *   - onboardingTasks (null = alta legacy; objeto = ventas o alta manual)
 *   - hasSaleStripe (true = vino por link Stripe / agenda de leads)
 *   - week0CompletedAt
 *   - stageActual: cómo lo categoriza hoy la vista escalonada
 *   - probableSource: mejor lectura humana del origen
 *
 * Solo CEO y head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

const DAYS_14_MS = 14 * 86400000;
const WEEKS_4_MS = 28 * 86400000;

function stageOf(p: {
  subscriptionStartDate: Date | null;
  giftsAlreadySent: boolean;
  onboardingTasks: unknown;
  week0CompletedAt: Date | null;
}): "onboarding" | "first_weeks" | "steady" | "sin-inicio" {
  const start = p.subscriptionStartDate?.getTime();
  if (!start) return "sin-inicio";
  const elapsed = Date.now() - start;
  const isLegacy = p.giftsAlreadySent === true || p.onboardingTasks == null;
  if (!isLegacy && !p.week0CompletedAt && elapsed <= DAYS_14_MS) return "onboarding";
  if (elapsed <= WEEKS_4_MS) return "first_weeks";
  return "steady";
}

function readableSource(p: {
  giftsAlreadySent: boolean;
  onboardingTasks: unknown;
  hasSaleStripe: boolean;
}): string {
  if (p.giftsAlreadySent && p.onboardingTasks == null) {
    return "📥 Paciente existente (legacy) — modal moderno";
  }
  if (p.onboardingTasks == null) {
    return "📥 Legacy antiguo (sin flag giftsAlreadySent, sin onboardingTasks)";
  }
  if (p.hasSaleStripe) {
    return "💳 Ventas / Stripe (agenda de leads o alta manual con link de pago)";
  }
  return "➕ Alta manual (botón + Nuevo paciente, sin pago Stripe)";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("name") || "").trim();
  if (!q) return NextResponse.json({ error: "Parámetro name requerido" }, { status: 400 });

  const patients = await prisma.patient.findMany({
    where: { fullName: { contains: q, mode: "insensitive" } },
    select: {
      id: true,
      fullName: true,
      startedAt: true,
      subscriptionStartDate: true,
      giftsAlreadySent: true,
      onboardingTasks: true,
      week0CompletedAt: true,
      email: true,
      _count: { select: { sales: true } },
    },
    take: 20,
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({
    query: q,
    count: patients.length,
    matches: patients.map((p) => {
      const hasSaleStripe = p._count.sales > 0;
      const stage = stageOf(p);
      return {
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        startedAt: p.startedAt?.toISOString() ?? null,
        subscriptionStartDate: p.subscriptionStartDate?.toISOString() ?? null,
        giftsAlreadySent: p.giftsAlreadySent,
        onboardingTasks: p.onboardingTasks,
        week0CompletedAt: p.week0CompletedAt?.toISOString() ?? null,
        hasSaleStripe,
        stageActual: stage,
        probableSource: readableSource({
          giftsAlreadySent: p.giftsAlreadySent,
          onboardingTasks: p.onboardingTasks,
          hasSaleStripe,
        }),
      };
    }),
  });
}
