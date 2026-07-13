/**
 * GET /api/admin/find-lead?q=texto
 *
 * Utilidad de diagnóstico: busca leads que contengan `q` en cualquiera de
 * los campos fullName, contactValue, email, phone, instagram, aiSummary.
 * Devuelve hasta 20 con todos los datos relevantes para identificar cuál
 * es el correcto.
 *
 * Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: "Falta ?q=texto" }, { status: 400 });

  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { fullName:     { contains: q, mode: "insensitive" } },
        { contactValue: { contains: q, mode: "insensitive" } },
        { email:        { contains: q, mode: "insensitive" } },
        { phone:        { contains: q, mode: "insensitive" } },
        { instagram:    { contains: q, mode: "insensitive" } },
        { aiSummary:    { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, fullName: true, contactType: true, contactValue: true,
      email: true, phone: true, instagram: true, status: true,
      callScheduledAt: true, createdAt: true, closerId: true,
    },
  });

  return NextResponse.json({ ok: true, count: leads.length, leads });
}
