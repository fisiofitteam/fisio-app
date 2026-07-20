/**
 * PATCH /api/alerts/[id]
 *   body: { action: "seen" | "dismiss" }
 *
 * - seen: la alerta queda marcada como vista pero sigue apareciendo en el
 *   buzon (con marca visual). Baja del contador del badge.
 * - dismiss: la alerta se archiva (deja de listarse). Auditoria: quien lo hizo.
 *
 * Auth: fisio, head_success o ceo.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { markAlertSeen, dismissAlert } from "@/lib/patient-alerts";

export const dynamic = "force-dynamic";

function canAccess(role: string): boolean {
  return role === "fisio" || role === "head_success" || role === "ceo";
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "seen" && action !== "dismiss") {
    return NextResponse.json({ error: "action requerido: seen | dismiss" }, { status: 400 });
  }
  const updated = action === "dismiss"
    ? await dismissAlert(params.id, user.id).catch(() => null)
    : await markAlertSeen(params.id, user.id).catch(() => null);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, alert: updated });
}
