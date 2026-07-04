/**
 * POST /api/rolling-tasks/from-session
 *
 * Crea N tareas WORKOUT en un día de una semana rolling a partir de una
 * sesión generada. Cada bloque de la sesión se convierte en una tarea con
 * su título (heading) y su cuerpo (body).
 *
 * Body: {
 *   weekId: string;
 *   dayOfWeek: number;         // 1-5 (lun-vie)
 *   session: {
 *     title: string;
 *     description?: string | null;
 *     blocks: Array<{ heading: string; body: string; exercises: string[] }>;
 *   };
 * }
 *
 * La description de sesión se antepone al bodyText del primer bloque si
 * está presente — así no se pierde y el paciente la ve al abrir la tarea.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { weekId, dayOfWeek, session } = body ?? {};
  if (!weekId || !dayOfWeek || !session || !Array.isArray(session.blocks)) {
    return NextResponse.json({ error: "Faltan datos (weekId, dayOfWeek, session.blocks)" }, { status: 400 });
  }
  if (session.blocks.length === 0) {
    return NextResponse.json({ error: "La sesión no tiene bloques" }, { status: 400 });
  }
  const dow = Number(dayOfWeek);
  if (!Number.isInteger(dow) || dow < 1 || dow > 5) {
    return NextResponse.json({ error: "dayOfWeek fuera de rango (1-5)" }, { status: 400 });
  }

  // Asegurar que el día existe
  let day = await prisma.rollingDay.findUnique({
    where: { weekId_dayOfWeek: { weekId, dayOfWeek: dow } },
  });
  if (!day) {
    day = await prisma.rollingDay.create({ data: { weekId, dayOfWeek: dow } });
  }

  const existing = await prisma.rollingTask.count({ where: { dayId: day.id } });

  const description: string = typeof session.description === "string" ? session.description.trim() : "";
  const sessionTitle: string = typeof session.title === "string" ? session.title.trim() : "";

  const created = [] as string[];
  let i = 0;
  for (const b of session.blocks as Array<{ heading?: string; body?: string; exercises?: string[] }>) {
    const heading = (b?.heading ?? "").toString().trim() || `Bloque ${i + 1}`;
    const rawBody = (b?.body ?? "").toString();

    // Description + título de la sesión se anteponen al primer bloque como cabecera
    // para que el paciente vea el contexto sin perderlo.
    let bodyText = rawBody;
    if (i === 0) {
      const header: string[] = [];
      if (sessionTitle) header.push(`_${sessionTitle}_`);
      if (description) header.push(`> ${description}`);
      if (header.length > 0) bodyText = header.join("\n\n") + "\n\n" + rawBody;
    }

    const task = await prisma.rollingTask.create({
      data: {
        dayId: day.id,
        type: "WORKOUT",
        order: existing + i,
        title: heading,
        bodyText,
      },
    });
    created.push(task.id);
    i++;
  }

  return NextResponse.json({ ok: true, taskIds: created });
}
