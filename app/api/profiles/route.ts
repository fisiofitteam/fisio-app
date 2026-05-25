import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { name, bodyZone, description } = await req.json();
  const profile = await prisma.clinicalProfile.create({
    data: {
      name,
      bodyZone,
      description: description || null,
      // Primer nivel automático para poder marcar ejercicios desde el inicio
      levels: { create: { name: "Nivel 1", order: 1 } },
    },
  });
  return NextResponse.json(profile);
}
