import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessEvidence, MAX_WHATSAPP_BYTES } from "@/lib/patient-evidence";
export const dynamic = "force-dynamic";
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const row = await prisma.patientEvidence.findUnique({ where: { id: params.id },
    select: { id: true, patientId: true, createdById: true, kind: true, status: true, size: true } });
  if (!row || !await canAccessEvidence(row)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (row.kind !== "whatsapp" || row.status !== "pending" || !row.size || row.size > MAX_WHATSAPP_BYTES)
    return NextResponse.json({ error: "La importación ya no está pendiente." }, { status: 409 });
  const b = await req.json().catch(() => null);
  if (!b || !Number.isInteger(b.offset) || b.offset < 0 || typeof b.chunk !== "string" || !b.chunk.length || b.chunk.includes("\u0000"))
    return NextResponse.json({ error: "Fragmento de texto no válido." }, { status: 400 });
  const bytes = Buffer.byteLength(b.chunk, "utf8");
  if (bytes > 512 * 1024 || b.offset + bytes > row.size)
    return NextResponse.json({ error: "El fragmento supera el tamaño permitido." }, { status: 400 });
  // Atomic offset check prevents duplicate chunks and concurrent appends.
  const changed = await prisma.$executeRaw`
    UPDATE "PatientEvidence"
    SET "textContent" = COALESCE("textContent", '') || ${b.chunk},
        "status" = CASE WHEN ${b.offset + bytes} = "size" THEN 'ready' ELSE 'pending' END,
        "updatedAt" = NOW()
    WHERE "id" = ${row.id} AND "status" = 'pending' AND "kind" = 'whatsapp'
      AND octet_length(COALESCE("textContent", '')) = ${b.offset}
      AND "size" = ${row.size}
  `;
  if (!changed) return NextResponse.json({ error: "La subida ha cambiado. Vuelve a seleccionar el TXT." }, { status: 409 });
  return NextResponse.json({ ok: true, complete: b.offset + bytes === row.size });
}
