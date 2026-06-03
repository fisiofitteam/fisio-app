import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const VALID_ROLES = ["fisio", "head_success", "setter", "closer"];
const VALID_KINDS = ["monthly", "monthly_weekday", "range"];

// GET /api/team-tasks-adhoc?role=fisio → lista CRUD para CEO + head_success.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const role = req.nextUrl.searchParams.get("role") ?? "fisio";
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Rol no válido" }, { status: 400 });

  const tasks = await prisma.teamTaskAdHoc.findMany({
    where: { targetRole: role },
    orderBy: [{ active: "desc" }, { kind: "asc" }, { startDate: "asc" }, { dayOfMonth: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

// POST /api/team-tasks-adhoc → crea tarea puntual.
// body: { title, targetRole, kind, dayOfMonth?, startDate?, endDate? }
//
// Permisos:
//   - CEO: puede crear con targetRole "fisio" o "head_success".
//   - head_success: solo "fisio".
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const targetRole = String(b?.targetRole || "");
  const kind = String(b?.kind || "");

  if (!title) return NextResponse.json({ error: "Título obligatorio" }, { status: 400 });
  if (!VALID_ROLES.includes(targetRole)) return NextResponse.json({ error: "Rol no válido" }, { status: 400 });
  if (!VALID_KINDS.includes(kind)) return NextResponse.json({ error: "kind no válido" }, { status: 400 });
  if (user.role === "head_success" && targetRole !== "fisio") {
    return NextResponse.json({ error: "Head Success solo puede crear tareas para Fisios" }, { status: 403 });
  }

  const description = typeof b?.description === "string" && b.description.trim() ? b.description.trim() : null;
  const data: any = { title, description, targetRole, kind, active: true, createdById: user.id };

  if (kind === "monthly") {
    const d = Number(b?.dayOfMonth);
    if (!Number.isFinite(d) || d < 1 || d > 31) {
      return NextResponse.json({ error: "Día del mes (1-31) obligatorio" }, { status: 400 });
    }
    data.dayOfMonth = d;
  } else if (kind === "monthly_weekday") {
    const n = Number(b?.nthWeek);
    const dow = Number(b?.dayOfWeek);
    if (!([1, 2, 3, 4, -1].includes(n))) {
      return NextResponse.json({ error: "nthWeek debe ser 1..4 ó -1" }, { status: 400 });
    }
    if (!([1, 2, 3, 4, 5, 6, 7].includes(dow))) {
      return NextResponse.json({ error: "dayOfWeek debe ser 1..7" }, { status: 400 });
    }
    data.nthWeek = n;
    data.dayOfWeek = dow;
  } else {
    const s = typeof b?.startDate === "string" ? new Date(b.startDate) : null;
    const e = typeof b?.endDate === "string" ? new Date(b.endDate) : null;
    if (!s || isNaN(s.getTime()) || !e || isNaN(e.getTime())) {
      return NextResponse.json({ error: "Fechas inicio/fin obligatorias" }, { status: 400 });
    }
    if (e < s) return NextResponse.json({ error: "endDate < startDate" }, { status: 400 });
    s.setUTCHours(0, 0, 0, 0);
    e.setUTCHours(0, 0, 0, 0);
    data.startDate = s;
    data.endDate = e;
  }

  // Asignados: array de Professional.id. Vacío = todos del role.
  if (Array.isArray(b?.assigneeIds)) {
    const ids = b.assigneeIds.filter((x: unknown) => typeof x === "string");
    data.assigneesJson = JSON.stringify(ids);
  }

  const created = await prisma.teamTaskAdHoc.create({ data });
  return NextResponse.json(created);
}
