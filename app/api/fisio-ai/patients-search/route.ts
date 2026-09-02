/**
 * GET /api/fisio-ai/patients-search?q=... — buscador de pacientes por
 * nombre parcial para el picker de Fisio IA. Devuelve máximo 10.
 *
 * Permisos:
 *   - CEO, head_success, closer, setter: todos los pacientes.
 *   - fisio: solo sus pacientes asignados (privacy razonable).
 *
 * Matching insensible a mayúsculas y a tildes: Prisma `contains` con
 * `mode: "insensitive"` cubre lo primero; el post-filter en JS con
 * normalización NFD cubre lo segundo (que no lo soporta el ORM sin
 * `unaccent` de Postgres). Como el pool es de ~300 pacientes, es
 * asumible traer los candidatos y filtrar en memoria.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ patients: [] });

  const restrictToOwn = user.role === "fisio";

  // Primer intento: match directo en BD (case-insensitive). Rápido y cubre
  // el 90% de búsquedas donde el usuario escribe sin tildes o con ellas.
  const dbMatches = await prisma.patient.findMany({
    where: {
      ...(restrictToOwn ? { assignedProfessionalId: user.id } : {}),
      fullName: { contains: q, mode: "insensitive" },
    },
    select: { id: true, fullName: true, programType: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });

  if (dbMatches.length > 0) return NextResponse.json({ patients: dbMatches });

  // Fallback normalizado sin tildes: traemos un pool amplio y filtramos.
  // Solo se ejecuta si el primer intento no devuelve nada, así el coste
  // extra solo se paga cuando el usuario busca "Nuñez" para encontrar
  // "Núñez", no en la mayoría de búsquedas.
  const pool = await prisma.patient.findMany({
    where: restrictToOwn ? { assignedProfessionalId: user.id } : {},
    select: { id: true, fullName: true, programType: true },
    orderBy: { fullName: "asc" },
  });
  const qNorm = stripAccents(q);
  const filtered = pool
    .filter((p) => stripAccents(p.fullName).includes(qNorm))
    .slice(0, 10);
  return NextResponse.json({ patients: filtered });
}
