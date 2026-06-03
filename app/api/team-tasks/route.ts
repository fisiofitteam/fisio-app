import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const VALID_ROLES = ["fisio", "head_success"];

// GET /api/team-tasks?role=fisio → lista todas las tareas (incluye inactivas
// si ?includeInactive=1). CEO-only para la administración. Los fisios y el
// head_success leen su board vía buildWeeklyBoardForProfessional() del server.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const role = req.nextUrl.searchParams.get("role") ?? "fisio";
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Rol no válido" }, { status: 400 });

  const tasks = await prisma.weeklyTeamTask.findMany({
    where: { targetRole: role },
    orderBy: [{ dayOfWeek: "asc" }, { order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

// POST /api/team-tasks → crea una tarea nueva (CEO).
// body: { title, dayOfWeek, targetRole, order? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const dayOfWeek = Number(b?.dayOfWeek);
  const targetRole = String(b?.targetRole || "");

  if (!title) return NextResponse.json({ error: "Título obligatorio" }, { status: 400 });
  if (![1, 2, 3, 4, 5].includes(dayOfWeek)) return NextResponse.json({ error: "Día no válido" }, { status: 400 });
  if (!VALID_ROLES.includes(targetRole)) return NextResponse.json({ error: "Rol no válido" }, { status: 400 });

  // El orden por defecto: último de su día/rol.
  const last = await prisma.weeklyTeamTask.findFirst({
    where: { targetRole, dayOfWeek },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = typeof b?.order === "number" ? b.order : (last?.order ?? 0) + 1;

  const created = await prisma.weeklyTeamTask.create({
    data: { title, dayOfWeek, targetRole, order, active: true },
  });
  return NextResponse.json(created);
}
