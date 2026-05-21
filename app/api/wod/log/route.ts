import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { patientId, rawText, adaptedText, rpe, painScore, notes } = await req.json();
  const log = await prisma.wodLog.create({
    data: {
      patientId,
      rawText,
      adaptedText,
      rpe: rpe ?? null,
      painScore: painScore ?? null,
      notes: notes || null,
      completedAt: new Date(),
    },
  });
  return NextResponse.json(log);
}
