import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

// PATCH /api/patient/shipping — el paciente actualiza su propia dirección de envío
// (estructurada). Acepta cualquier subconjunto de campos.
export async function PATCH(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const clean = (v: unknown) =>
    v === null || v === "" ? null :
    typeof v === "string" ? v.trim() || null : undefined;

  const fields = [
    "shippingStreet", "shippingNumber", "shippingFloor", "shippingStaircase",
    "shippingDoor", "shippingCity", "shippingProvince", "shippingPostalCode",
    "shippingPhone",
  ] as const;

  const data: Record<string, string | null> = {};
  for (const f of fields) {
    const v = clean(b?.[f]);
    if (v !== undefined) data[f] = v;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  await prisma.patient.update({ where: { id: patient.id }, data });
  return NextResponse.json({ ok: true });
}
