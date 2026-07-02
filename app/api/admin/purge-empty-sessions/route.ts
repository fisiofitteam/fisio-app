/**
 * POST /api/admin/purge-empty-sessions
 *
 * Limpia las ProgramSession "fantasma" que se crearon en asignaciones
 * pasadas por el bug de generateSessions: los ProgramDay vacíos (sin
 * tareas) generaban una sesión con tasksSnapshot = "[]". Esto ensuciaba
 * la vista del paciente cuando tenía varios programas asignados a la
 * vez — cada día del calendario tenía sesiones vacías del programa que
 * no toca ese día.
 *
 * Regla del borrado:
 *   - tasksSnapshot vacío (JSON.parse => []).
 *   - completedAt IS NULL (no tocamos las que el paciente ya marcó).
 *
 * Devuelve el conteo de sesiones borradas para auditoría.
 * Solo CEO y head_success. Idempotente: se puede lanzar varias veces.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Traer todas las sesiones no completadas y filtrar en JS por snapshot
  // vacío (Prisma no soporta "JSON string igual a '[]'" de forma clean
  // multi-BD y en prod son pocas miles, se hace en un solo pase).
  const candidates = await prisma.programSession.findMany({
    where: { completedAt: null },
    select: { id: true, tasksSnapshot: true, assignmentId: true },
  });

  const toDelete: string[] = [];
  for (const s of candidates) {
    try {
      const arr = JSON.parse(s.tasksSnapshot);
      if (Array.isArray(arr) && arr.length === 0) {
        toDelete.push(s.id);
      }
    } catch {
      // Snapshot corrupto: también lo borramos (no aporta nada).
      toDelete.push(s.id);
    }
  }

  if (toDelete.length === 0) {
    return NextResponse.json({
      ok: true,
      scanned: candidates.length,
      deleted: 0,
    });
  }

  const result = await prisma.programSession.deleteMany({
    where: { id: { in: toDelete } },
  });

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    deleted: result.count,
  });
}
