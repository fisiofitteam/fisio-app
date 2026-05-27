import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getPeriodRange, type Period } from "@/lib/finance";
import { metaConfigured, getAdsInsights } from "@/lib/meta";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// GET /api/integrations/meta/ads-insights?period=month&level=adset|ad&parentId=...
// Desglose: conjuntos de una campaña (level=adset) o anuncios de un conjunto (level=ad).
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!metaConfigured()) return NextResponse.json({ error: "Meta no configurado" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const period = (["month", "quarter", "year"].includes(sp.get("period") ?? "") ? sp.get("period") : "month") as Period;
  const level = sp.get("level") === "ad" ? "ad" : "adset";
  const parentId = sp.get("parentId") || "";
  if (!parentId) return NextResponse.json({ error: "parentId requerido" }, { status: 400 });

  const { start, end } = getPeriodRange(period);
  try {
    const rows = await getAdsInsights({
      level,
      since: ymd(start),
      until: ymd(end),
      parentField: level === "adset" ? "campaign" : "adset",
      parentId,
    });
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
