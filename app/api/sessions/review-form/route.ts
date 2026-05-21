import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  const updated = await prisma.programSession.update({
    where: { id: sessionId },
    data: { formReviewedAt: new Date() },
  });
  return NextResponse.json(updated);
}
