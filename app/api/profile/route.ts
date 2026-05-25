import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// GET /api/profile — datos del perfil propio del profesional logueado.
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = await prisma.professional.findUnique({
    where: { id: user.id },
    select: { fullName: true, fiscalName: true, taxId: true, fiscalAddress: true, iban: true, photoUrl: true, vatExempt: true },
  });
  return NextResponse.json(p);
}

// PUT /api/profile — actualiza el perfil propio.
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  await prisma.professional.update({
    where: { id: user.id },
    data: {
      fiscalName: str(b.fiscalName),
      taxId: str(b.taxId),
      fiscalAddress: str(b.fiscalAddress),
      iban: str(b.iban),
      photoUrl: str(b.photoUrl),
      vatExempt: b.vatExempt !== false,
    },
  });
  return NextResponse.json({ ok: true });
}
