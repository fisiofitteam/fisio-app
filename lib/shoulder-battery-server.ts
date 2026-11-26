import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { groupShoulderBatteries, shoulderBatteryKey, shoulderBatteryDayKey, type BatterySession } from "./shoulder-battery";
import { PILOT_PROGRAM_ID } from "./shoulder-pilot";
import { pilotSnapshotRefs } from "./shoulder-pilot-snapshot";

export const batterySessionSelect = {
  id: true, assignmentId: true, scheduledDate: true, weekNumber: true, tasksSnapshot: true,
  assignment: { select: { id: true, programId: true, patientId: true, program: { select: { isStandalone: true } }, patient: { select: { fullName: true } } } },
} as const;
type Reader = Pick<Prisma.TransactionClient, "programSession">;

export function batteryDayRange(date: Date) {
  const start = new Date(date.toISOString().slice(0, 10) + "T00:00:00.000Z");
  return { gte: start, lt: new Date(start.getTime() + 86400000) };
}

type SourceSession = Prisma.ProgramSessionGetPayload<{ select: typeof batterySessionSelect }>;
export function batteryPeersWhere(session: BatterySession): Prisma.ProgramSessionWhereInput {
  return {
    assignment: { patientId: session.assignment.patientId,
      OR: [{ programId: PILOT_PROGRAM_ID }, { program: { isStandalone: true } }] },
    scheduledDate: batteryDayRange(session.scheduledDate), tasksSnapshot: { contains: "ASSESSMENT" },
  };
}

export async function resolveShoulderBattery(session: SourceSession, db: Reader = prisma) {
  if (!shoulderBatteryDayKey(session)) return null;
  if (shoulderBatteryKey(session) && pilotSnapshotRefs(session.tasksSnapshot)) return groupShoulderBatteries([session])[0] ?? null;
  const siblings = await db.programSession.findMany({
    where: batteryPeersWhere(session),
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
    where: { assignmentId, tasksSnapshot: { contains: "ASSESSMENT" } },
    select: { ...batterySessionSelect, shoulderPilotReview: { select: { sessionId: true } } },
  });
  const days = new Map(sessions.filter(s => shoulderBatteryDayKey(s)).map(s => [shoulderBatteryDayKey(s)!, s]));
  if (!days.size) return [];
  const peers = await prisma.programSession.findMany({
    where: { OR: [...days.values()].map(batteryPeersWhere) },
    select: { ...batterySessionSelect, shoulderPilotReview: { select: { sessionId: true } } },
  });
  return groupShoulderBatteries(peers).filter(g => g.sessions.some(s => s.shoulderPilotReview))
    .flatMap(g => g.sessions.filter(s => s.assignmentId === assignmentId).map(s => s.id));
}
