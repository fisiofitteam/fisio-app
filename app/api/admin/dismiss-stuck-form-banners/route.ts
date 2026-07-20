/**
 * One-off para limpiar los banners de "formulario pendiente" que quedaron
 * atrapados por el bug de SessionRunner: la sesión estaba completada, el
 * FORM sin respuesta y al entrar el detector auto-bloqueaba los inputs.
 *
 * Marca cada FORM sin responder de sesiones YA COMPLETADAS con un objeto
 * placeholder `{ __skipped: true, dismissedAt }`. El detector de banners
 * (getPendingFormsForPatient) considera "no vacío" cualquier objeto con
 * keys, así que dejan de listarse. Los pacientes ven el banner desaparecer
 * inmediatamente (o al siguiente refresh del home).
 *
 * Sesiones no completadas se dejan intactas — el paciente todavía puede
 * rellenarlas en el flujo normal.
 *
 * GET  → dry-run: cuenta cuántas sesiones/forms se tocarían, sin escribir.
 * POST → ejecuta el barrido. Devuelve el conteo.
 *
 * Solo CEO / head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  responses: string | null;
  tasksSnapshot: string;
};

async function collectStuck() {
  const sessions = await prisma.programSession.findMany({
    where: {
      completedAt: { not: null },
      tasksSnapshot: { contains: '"FORM"' },
    },
    select: { id: true, responses: true, tasksSnapshot: true },
  });

  let sessionsAffected = 0;
  let formsMarked = 0;
  const plan: Array<{ sessionId: string; responsesNext: string }> = [];

  for (const s of sessions as Row[]) {
    let tasks: any[] = [];
    let responses: Record<string, any> = {};
    try { tasks = JSON.parse(s.tasksSnapshot) as any[]; } catch { continue; }
    if (s.responses) {
      try { responses = JSON.parse(s.responses) as Record<string, any>; } catch { responses = {}; }
    }

    let touched = false;
    for (const t of tasks) {
      if (t?.type !== "FORM") continue;
      const r = responses[t.id];
      const empty = r === undefined || r === null || (typeof r === "object" && Object.keys(r).length === 0);
      if (!empty) continue;
      responses[t.id] = { __skipped: true, dismissedAt: new Date().toISOString() };
      touched = true;
      formsMarked++;
    }
    if (touched) {
      sessionsAffected++;
      plan.push({ sessionId: s.id, responsesNext: JSON.stringify(responses) });
    }
  }

  return { sessionsAffected, formsMarked, plan };
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sessionsAffected, formsMarked } = await collectStuck();
  return NextResponse.json({ mode: "dry-run", sessionsAffected, formsMarked });
}

export async function POST(_req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sessionsAffected, formsMarked, plan } = await collectStuck();

  // Transacción en tandas para no colgar Neon con updates masivos. En la
  // práctica esperamos decenas o pocos cientos de sesiones — sobra con
  // batch de 50.
  const BATCH = 50;
  for (let i = 0; i < plan.length; i += BATCH) {
    const slice = plan.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((p) =>
        prisma.programSession.update({
          where: { id: p.sessionId },
          data: { responses: p.responsesNext },
        })
      )
    );
  }

  return NextResponse.json({ mode: "applied", sessionsAffected, formsMarked });
}
