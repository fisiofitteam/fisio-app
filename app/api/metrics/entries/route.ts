import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { entries, recordedAt } = await req.json();
  const date = recordedAt ? new Date(recordedAt) : new Date();
  date.setHours(12, 0, 0, 0);

  const created = [];
  for (const e of entries as { metricId: string; value: number }[]) {
    if (typeof e.value !== "number" || isNaN(e.value)) continue;
    const entry = await prisma.metricEntry.create({
      data: {
        metricId: e.metricId,
        value: e.value,
        recordedAt: date,
        source: "manual",
      },
    });
    created.push(entry);
  }
  return NextResponse.json({ created });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.metricEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
