/**
 * POST /api/ai/ceo-report/generate
 *
 * Genera un Informe CEO para un periodo (week/month/quarter/custom).
 * Snapshot de metricas + periodo anterior + hasta 4 informes previos del
 * mismo periodType se envian a Sonnet 4.6 para tejer la narrativa.
 *
 * Body:
 *   { periodType: "week"|"month"|"quarter"|"custom", from?: string, to?: string }
 *
 * Para "week"/"month"/"quarter" sin from/to se usa el periodo ACTUAL
 * (esta semana / este mes / este trimestre). Para "custom" from y to
 * son obligatorios (ISO YYYY-MM-DD).
 *
 * Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getPeriodRange } from "@/lib/finance";
import { generateCeoReport, type CeoPeriodType } from "@/lib/ceo-report";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawType = String(body?.periodType ?? "week");
    const validTypes: CeoPeriodType[] = ["week", "month", "quarter", "custom"];
    if (!validTypes.includes(rawType as CeoPeriodType)) {
      return NextResponse.json({ error: "periodType invalido" }, { status: 400 });
    }
    const periodType = rawType as CeoPeriodType;

    let start: Date, end: Date, label: string;
    if (periodType === "custom") {
      const from = String(body?.from ?? "");
      const to = String(body?.to ?? "");
      if (!from || !to) {
        return NextResponse.json({ error: "from y to obligatorios para custom" }, { status: 400 });
      }
      start = new Date(from);
      end = new Date(to);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NextResponse.json({ error: "Fechas invalidas" }, { status: 400 });
      }
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
      label = `${fmt(start)} → ${fmt(end)}`;
    } else {
      const r = getPeriodRange(periodType);
      start = r.start;
      end = r.end;
      label = r.label;
    }

    const result = await generateCeoReport({
      periodType,
      start,
      end,
      label,
      generatedById: user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[ceo-report/generate]", e);
    return NextResponse.json({ error: e?.message ?? "Error generando informe" }, { status: 500 });
  }
}
