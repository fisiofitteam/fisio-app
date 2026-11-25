import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canReadCallContext, contextLeadSelect, ensureCallContext } from "@/lib/skalex/call-context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) return json({ error: "Origen no permitido." }, 403);
  const user = await getActiveProfessional();
  if (!user) return json({ error: "No autorizado." }, 401);
  const roles = [user.role, ...(user.extraRoles || [])];
  if (user.role !== "ceo" && user.role !== "setter" && !roles.includes("closer")) return json({ error: "No autorizado." }, 403);
  const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: contextLeadSelect });
  if (!lead || !canReadCallContext(user, lead)) return json({ error: "Llamada no disponible." }, 404);
  try { return json({ context: await ensureCallContext(lead) }); }
  catch { return json({ error: "No se pudo cargar el contexto de la conversación. Puedes reintentarlo." }, 503); }
}
