import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { feedbackSchema, type WodResult } from "@/lib/public-wod/contracts";
import { PublicWodError, entryDTO, failure, json, rateLimit, readJson, requireOrigin, requireProfile } from "@/lib/public-wod/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req); const row = await requireProfile(); await rateLimit(req, "feedback", 30, 3600, row.id);
    const data = feedbackSchema.parse(await readJson(req));
    const owned = await prisma.publicWodEntry.findFirst({ where: { id: data.entryId, profileId: row.id } });
    if (!owned) throw new PublicWodError(404, "No se encuentra este WOD.");
    const result: WodResult = JSON.parse(owned.resultJson);
    const lines = result.lines.filter(line => line.status !== "context");
    if (result.gate !== "none" || data.exercises.length !== lines.length || new Set(data.exercises.map(e => e.key)).size !== data.exercises.length ||
      data.exercises.some(e => !lines.some(line => line.key === e.key && (e.performed !== "as-proposed" || !!line.proposedMovementId)))) throw new PublicWodError(400, "Revisa el registro de cada ejercicio.");
    if (data.response !== "not-done" && !data.exercises.some(e => e.performed !== "skipped")) throw new PublicWodError(400, "Indica al menos un ejercicio realizado o marca que no hiciste el WOD.");
    // A next-day response must really be recorded later, not immediately after the WOD.
    if ((data.painNextDay !== null || data.nextDay !== "pending") && (!owned.completedAt || Date.now() - owned.completedAt.getTime() < 18 * 3600000)) throw new PublicWodError(400, "Podrás completar la respuesta del día siguiente cuando hayan pasado al menos 18 horas.");
    return json(entryDTO(await prisma.publicWodEntry.update({ where: { id: owned.id }, data: { feedbackJson: JSON.stringify(data), completedAt: data.response === "not-done" ? null : owned.completedAt || new Date() } })));
  } catch (e) { return failure(e); }
}
