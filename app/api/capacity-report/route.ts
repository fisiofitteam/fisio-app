import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { computeCapacityReport } from "@/lib/capacity";

/**
 * GET /api/capacity-report → JSON con el reporte completo. Se llama solo
 * cuando el tab "Capacidad operativa" se activa en el panel — la query
 * es pesada (varias tablas) y no queremos pagarla en cada carga.
 *
 * Solo CEO y head_success.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await computeCapacityReport();
  return NextResponse.json({ data });
}
