import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { patientId, name, unit } = await req.json();
  const existing = await prisma.patientMetric.findFirst({ where: { patientId } });
  const order = existing ? (await prisma.patientMetric.count({ where: { patientId } })) : 0;
  const key = `custom_${Date.now()}`;
  const metric = await prisma.patientMetric.create({
    data: {
      patientId,
      key,
      name,
      unit: unit || null,
      isPreset: false,
      isVisible: true,
      order,
    },
  });
  return NextResponse.json(metric);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.patientMetric.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
