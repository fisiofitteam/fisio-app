import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

const VALID = ["XS", "S", "M", "L", "XL", "XXL"];

// POST /api/patient/shirt-size — el paciente registra/edita su talla de camiseta.
// body: { size }
export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const size = typeof b?.size === "string" ? b.size.trim().toUpperCase() : "";
  if (!VALID.includes(size)) {
    return NextResponse.json({ error: "Talla no válida" }, { status: 400 });
  }

  const saved = await prisma.patient.update({
    where: { id: patient.id },
    data: { shirtSize: size },
    select: { id: true, shirtSize: true },
  });
  return NextResponse.json(saved);
}
