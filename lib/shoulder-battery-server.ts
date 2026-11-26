import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { groupShoulderBatteries, shoulderBatteryKey } from "./shoulder-battery";
import { pilotSnapshotRefs } from "./shoulder-pilot-snapshot";

export const batterySessionSelect = {
  id: true, assignmentId: true, scheduledDate: true, weekNumber: true, tasksSnapshot: true,
  assignment: { select: { id: true, programId: true, patientId: true, patient: { select: { fullName: true } } } },
} as const;
type Reader = Pick<Prisma.TransactionClient, "programSession">;

export function batteryDayRange(date: Date) {
  const start = new Date(date.toISOString().slice(0, 10) + "T00:00:00.000Z");
  return { gte: start, lt: new Date(start.getTime() + 86400000) };
}

type SourceSession = Prisma.ProgramSessionGetPayload<{ select: typeof batterySessionSelect }>;
export async function resolveShoulderBattery(session: SourceSession, db: Reader = prisma) {
  if (!shoulderBatteryKey(session)) return null;
  if (pilotSnapshotRefs(session.tasksSnapshot)) return groupShoulderBatteries([session])[0] ?? null;
  const siblings = await db.programSession.findMany({
    where: { assignmentId: session.assignmentId, weekNumber: session.weekNumber,
      scheduledDate: batteryDayRange(session.scheduledDate) },
    select: batterySessionSelect,
  });
  return groupShoulderBatteries(siblings).find(g => g.sessions.some(s => s.id === session.id)) ?? null;
}

// A draft belongs to the whole grouped battery, including members without a
// review row of their own. Calendar edits must not detach one of those sources.
export async function groupedBatteryHasReview(sessionId: string) {
  const session = await prisma.programSession.findUnique({ where: { id: sessionId }, select: batterySessionSelect });
  const group = session && await resolveShoulderBattery(session);
  if (!group || group.sessions.length < 2) return false;
  return !!await prisma.shoulderPilotReview.findUnique({ where: { sessionId: group.session.id }, select: { sessionId: true } });
}

export async function reviewedBatterySessionIds(assignmentId: string) {
  const sessions = await prisma.programSession.findMany({
    where: { assignmentId, weekNumber: { in: [1, 14] }, tasksSnapshot: { contains: "ASSESSMENT" } },
    select: { ...batterySessionSelect, shoulderPilotReview: { select: { sessionId: true } } },
  });
  return groupShoulderBatteries(sessions).filter(g => g.sessions.some(s => s.shoulderPilotReview))
    .flatMap(g => g.sessions.map(s => s.id));
}
