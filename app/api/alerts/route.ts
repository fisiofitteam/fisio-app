/**
 * GET /api/alerts
 *   - ?count=1 → devuelve solo { unseen: N } para el badge de la sidebar.
 *   - ?scope=mine|all (default mine para fisios, all para managers)
 *   - ?includeSeen=1 → incluye alertas ya vistas (para historial)
 *   - ?includeInfo=1 → incluye severidad "info" (por defecto solo warn+)
 *   - ?patientId=... → filtrar por paciente concreto
 *
 * Auth: cualquier profesional (fisio, head_success, ceo). Setter/closer sin
 * acceso — es una feature clinica.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { countUnseenAlerts, listAlerts } from "@/lib/patient-alerts";

export const dynamic = "force-dynamic";

function canAccess(role: string): boolean {
  return role === "fisio" || role === "head_success" || role === "ceo";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const isManager = user.role === "ceo" || user.role === "head_success";
  // Por defecto, un fisio ve solo las suyas y un manager ve todas. Los
  // fisios normales NO PUEDEN ver alertas de otros pacientes aunque
  // manden ?scope=all — se ignora y se fuerza "mine" (privacidad clinica).
  const scopeParam = sp.get("scope");
  const scope: "mine" | "all" = !isManager
    ? "mine"
    : scopeParam === "mine"
      ? "mine"
      : "all";

  if (sp.get("count") === "1") {
    // Contador barato: solo suena para lo que el usuario ve en su vista por
    // defecto. Manager → global. Fisio → los suyos.
    const unseen = await countUnseenAlerts(scope === "mine" ? user.id : null);
    return NextResponse.json({ unseen });
  }

  const alerts = await listAlerts({
    scope,
    professionalId: user.id,
    includeSeen: sp.get("includeSeen") === "1",
    includeInfo: sp.get("includeInfo") === "1",
    patientId: sp.get("patientId") ?? undefined,
    limit: Number(sp.get("limit") ?? 100),
  });
  return NextResponse.json({ alerts });
}
