import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSessions, getMondayOfWeek } from "@/lib/programs";

export async function POST(req: NextRequest) {
  const { patientId, programId, startDate, weeksCount } = await req.json();

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    return NextResponse.json({ error: "program not found" }, { status: 404 });
  }

  // Forzar inicio en lunes
  const start = getMondayOfWeek(new Date(startDate));

  const assignment = await prisma.programAssignment.create({
    data: {
      patientId,
      programId,
      startDate: start,
      weeksCount: Number(weeksCount) || program.weeksCount,
      isActive: true,
    },
  });

  await generateSessions(assignment.id);
  return NextResponse.json(assignment);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.programAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
