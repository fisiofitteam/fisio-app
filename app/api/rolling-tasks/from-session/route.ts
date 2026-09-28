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

/**
 * Normaliza a minúsculas sin acentos ni espacios extra. Idéntico al
 * matcher de /api/exercises/match para que "Hip Thrust" y "hip thrust"
 * casen igual.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

  // Cargamos la semana con su programa para decidir si auto-vinculamos
  // vídeos. En "advance-entrenamiento" los nombres de ejercicio son WODs,
  // Olympic lifts y demás y el matching contra la biblioteca de accesorios
  // se lía (mete vídeos que no son). En prevention/accesorios sí lo queremos.
  const weekWithProgram = await prisma.rollingWeek.findUnique({
    where: { id: weekId },
    select: { program: { select: { role: true } } },
  });
  const programRole = weekWithProgram?.program?.role ?? "";
  const shouldLinkExercises = programRole !== "advance-entrenamiento";

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

  // Cargamos la biblioteca una sola vez para matchear los nombres de
  // ejercicios que devuelve la IA con la biblioteca (id + youtubeUrl).
  // La biblioteca es pequeña, así que hacerlo en memoria es más barato
  // que N queries y respeta el mismo criterio que /api/exercises/match.
  // Sólo si el programa lo requiere (skip para advance-entrenamiento).
  const library = shouldLinkExercises
    ? await prisma.exerciseLibrary.findMany({ select: { id: true, name: true } })
    : [];
  const indexed = library.map((ex) => ({ id: ex.id, key: normalize(ex.name) }));
  function matchName(raw: string): string | null {
    if (!shouldLinkExercises) return null;
    const key = normalize(raw);
    if (!key) return null;
    let hit = indexed.find((x) => x.key === key);
    if (!hit) hit = indexed.find((x) => x.key.includes(key));
    if (!hit) hit = indexed.find((x) => key.includes(x.key));
    return hit ? hit.id : null;
  }

  const created: string[] = [];
  const matchStats: { taskId: string; matched: number; unmatched: string[] }[] = [];
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

    // Auto-vincular ejercicios de la biblioteca. Matchea cada nombre
    // devuelto por la IA; los que no encuentra los deja fuera y los
    // devolvemos en matchStats para poder avisar en la UI si conviene.
    const exerciseNames = Array.isArray(b?.exercises) ? b!.exercises! : [];
    const seenIds = new Set<string>();
    const orderedIds: string[] = [];
    const unmatched: string[] = [];
    for (const raw of exerciseNames) {
      const name = String(raw ?? "").trim();
      if (!name) continue;
      const eid = matchName(name);
      if (eid && !seenIds.has(eid)) {
        seenIds.add(eid);
        orderedIds.push(eid);
      } else if (!eid) {
        unmatched.push(name);
      }
    }
    if (orderedIds.length > 0) {
      await prisma.rollingTaskExercise.createMany({
        data: orderedIds.map((eid, idx) => ({ rollingTaskId: task.id, exerciseId: eid, order: idx })),
      });
    }
    matchStats.push({ taskId: task.id, matched: orderedIds.length, unmatched });

    created.push(task.id);
    i++;
  }

  return NextResponse.json({ ok: true, taskIds: created, matchStats });
}
