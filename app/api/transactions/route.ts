import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const RECEIPT_MARKER = "[ff-receipt:v1";
const receiptConflict = () => NextResponse.json(
  { error: "Los cobros verificados del proveedor no se pueden editar ni eliminar desde el registro manual." },
  { status: 409 },
);
function isVerifiedReceipt(row: { id: string; description: string | null }) {
  return row.id.startsWith("receipt:") || (row.description?.includes(RECEIPT_MARKER) ?? false);
}
function manualTransactionWhere(id: string) {
  // Adoption may attach a verified-receipt marker after the initial read.
  // This predicate is evaluated atomically by the UPDATE/DELETE itself.
  return { id, OR: [{ description: null }, { description: { not: { contains: RECEIPT_MARKER } } }] };
}
function noLongerMutable(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

export async function POST(req: NextRequest) {
  const { type, category, amount, description, occurredAt, professionalId, patientId } = await req.json();
  const t = await prisma.transaction.create({
    data: {
      type,
      category: category || null,
      amount: Number(amount),
      description: description || null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      professionalId: professionalId || null,
      patientId: patientId || null,
    },
  });
  return NextResponse.json(t);
}

export async function PATCH(req: NextRequest) {
  const { id, type, category, amount, description, occurredAt, professionalId, patientId } = await req.json();
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const existing = await prisma.transaction.findUnique({ where: { id }, select: { id: true, description: true } });
  if (!existing) return NextResponse.json({ error: "Transacción no encontrada" }, { status: 404 });
  if (isVerifiedReceipt(existing)) return receiptConflict();
  try {
    const t = await prisma.transaction.update({
      where: manualTransactionWhere(id),
      data: {
        ...(type !== undefined && { type }),
        ...(category !== undefined && { category: category || null }),
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(description !== undefined && { description: description || null }),
        ...(occurredAt !== undefined && { occurredAt: new Date(occurredAt) }),
        ...(professionalId !== undefined && { professionalId: professionalId || null }),
        ...(patientId !== undefined && { patientId: patientId || null }),
      },
    });
    return NextResponse.json(t);
  } catch (error) {
    if (noLongerMutable(error)) return receiptConflict();
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const existing = await prisma.transaction.findUnique({ where: { id }, select: { id: true, description: true } });
  if (!existing) return NextResponse.json({ error: "Transacción no encontrada" }, { status: 404 });
  if (isVerifiedReceipt(existing)) return receiptConflict();
  try {
    await prisma.transaction.delete({ where: manualTransactionWhere(id) });
  } catch (error) {
    if (noLongerMutable(error)) return receiptConflict();
    throw error;
  }
  return NextResponse.json({ ok: true });
}
