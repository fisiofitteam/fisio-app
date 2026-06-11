import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = ["ceo", "head_success", "fisio", "setter", "closer"] as const;
function normalizeRole(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return (VALID_ROLES as readonly string[]).includes(value) ? value : undefined;
}

export async function POST(req: NextRequest) {
  const { name, category, body, targetRole } = await req.json();
  const m = await prisma.messageTemplate.create({
    data: {
      name,
      category: category || "Otros",
      body,
      targetRole: normalizeRole(targetRole) ?? "ceo",
    },
  });
  return NextResponse.json(m);
}

export async function PATCH(req: NextRequest) {
  const { id, name, category, body, targetRole } = await req.json();
  const role = normalizeRole(targetRole);
  const m = await prisma.messageTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(body !== undefined && { body }),
      ...(role !== undefined && { targetRole: role }),
    },
  });
  return NextResponse.json(m);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
