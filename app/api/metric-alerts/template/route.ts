/**
 * GET  /api/metric-alerts/template → devuelve la plantilla global vigente.
 * PUT  /api/metric-alerts/template → actualiza (CEO / head_success).
 * body: { config: { fatigue: {...}, rpe: {...}, sleep: {...} } }
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getGlobalTemplate, setGlobalTemplate, normalizeConfig } from "@/lib/metric-alerts";

export const dynamic = "force-dynamic";

function canRead(role: string): boolean {
  return role === "fisio" || role === "head_success" || role === "ceo";
}
function canWrite(role: string): boolean {
  return role === "head_success" || role === "ceo";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canRead(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const config = await getGlobalTemplate();
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canWrite(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const normalized = normalizeConfig(body?.config);
  const saved = await setGlobalTemplate(normalized, user.id);
  return NextResponse.json({ config: saved });
}
