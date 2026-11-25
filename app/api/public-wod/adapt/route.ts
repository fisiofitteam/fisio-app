import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { adaptSchema, profileSchema, selfTestSchema } from "@/lib/public-wod/contracts";
import { adaptPublicWod } from "@/lib/public-wod/engine";
import type { LearningRecord } from "@/lib/public-wod/learning";
import { PublicWodError, entryDTO, failure, json, rateLimit, readJson, requireOrigin, requireProfile, touchProfile } from "@/lib/public-wod/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req); const row = await requireProfile(); await rateLimit(req, "adapt", 40, 3600, row.id);
    const input = adaptSchema.parse(await readJson(req));
    const profile = profileSchema.parse(JSON.parse(row.profileJson));
    const selfTest = row.selfTestJson ? selfTestSchema.parse(JSON.parse(row.selfTestJson)) : null;
    const previous = await prisma.publicWodEntry.findMany({ where: { profileId: row.id, feedbackJson: { not: null }, completedAt: { not: null }, ...(input.entryId ? { id: { not: input.entryId } } : {}) }, orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: 100 });
    const history: LearningRecord[] = previous.reverse().map(entry => ({ input: JSON.parse(entry.inputJson), result: JSON.parse(entry.resultJson), feedback: JSON.parse(entry.feedbackJson!) }));
    const result = adaptPublicWod(profile, selfTest, input, history);
    const data = { rawText: input.rawText, readiness: input.readiness, inputJson: JSON.stringify(input), profileSnapshot: JSON.stringify({ profile, selfTest }), resultJson: JSON.stringify(result), engineVersion: result.version };
    let entry;
    if (input.entryId) {
      // Ownership is always bound to the authenticated public profile, never to a supplied profileId.
      const owned = await prisma.publicWodEntry.findFirst({ where: { id: input.entryId, profileId: row.id } });
      if (!owned) throw new PublicWodError(404, "No se encuentra este WOD.");
      if (owned.feedbackJson) throw new PublicWodError(409, "Este WOD ya tiene un registro. Crea una nueva adaptación para conservarlo.");
      entry = await prisma.publicWodEntry.update({ where: { id: owned.id }, data: { ...data, feedbackJson: null } });
    } else {
      // Network retries and double taps produce one WOD and one conversion event.
      entry = await prisma.publicWodEntry.upsert({ where: { profileId_requestId: { profileId: row.id, requestId: input.requestId } }, create: { ...data, profileId: row.id, requestId: input.requestId }, update: {} });
    }
    await touchProfile(row.id); return json(entryDTO(entry));
  } catch (e) { return failure(e); }
}
