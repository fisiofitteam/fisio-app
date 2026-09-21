import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getOpsConfig, saveOpsConfig } from "@/lib/ops-config";

/**
 * GET /api/ops-config  → devuelve la config actual (crea el singleton
 *   con defaults la primera vez).
 * POST /api/ops-config → actualiza la config con normalización (clamps
 *   + coherencia entre warn/crit).
 *
 * Solo CEO y head_success.
 */

function canAccess(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const config = await getOpsConfig();
  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const saved = await saveOpsConfig(body ?? {});
  return NextResponse.json({ config: saved });
}
