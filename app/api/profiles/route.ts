import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { name, bodyZone, description } = await req.json();
  const profile = await prisma.clinicalProfile.create({
    data: { name, bodyZone, description: description || null },
  });
  return NextResponse.json(profile);
}
