import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const VALID_ROLES = ["fisio", "head_success"];

// GET /api/team-tasks?role=fisio → lista las tareas semanales del rol.
// CEO ve todo. head_success solo puede consultar las de "fisio".
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = req.nextUrl.searchParams.get("role") ?? "fisio";
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Rol no válido" }, { status: 400 });
  if (user.role === "head_success" && role !== "fisio") {
    return NextResponse.json({ error: "Head Success solo gestiona tareas de Fisios" }, { status: 403 });
  }

  const tasks = await prisma.weeklyTeamTask.findMany({
    where: { targetRole: role },
    orderBy: [{ dayOfWeek: "asc" }, { order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

// POST /api/team-tasks → crea una tarea nueva.
// CEO puede para los dos roles. Head_success solo para "fisio".
// body: { title, dayOfWeek, targetRole, order? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const dayOfWeek = Number(b?.dayOfWeek);
  const targetRole = String(b?.targetRole || "");

  if (!title) return NextResponse.json({ error: "Título obligatorio" }, { status: 400 });
  if (![1, 2, 3, 4, 5].includes(dayOfWeek)) return NextResponse.json({ error: "Día no válido" }, { status: 400 });
  if (!VALID_ROLES.includes(targetRole)) return NextResponse.json({ error: "Rol no válido" }, { status: 400 });
  if (user.role === "head_success" && targetRole !== "fisio") {
    return NextResponse.json({ error: "Head Success solo puede crear tareas para Fisios" }, { status: 403 });
  }

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
