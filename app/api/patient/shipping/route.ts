import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

// PATCH /api/patient/shipping — el paciente actualiza su propia dirección de envío
// (estructurada) y datos fiscales. El DNI / NIE es obligatorio al guardar.
export async function PATCH(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const dni = typeof b?.contractDNI === "string" ? b.contractDNI.trim().toUpperCase() : "";
  if (!dni || dni.length > 30) {
    return NextResponse.json({ error: "El DNI / NIE es obligatorio (máximo 30 caracteres)." }, { status: 400 });
  }
  const clean = (v: unknown) =>
    v === null || v === "" ? null :
    typeof v === "string" ? v.trim() || null : undefined;

  const fields = [
    "shippingStreet", "shippingNumber", "shippingFloor", "shippingStaircase",
    "shippingDoor", "shippingCity", "shippingProvince", "shippingPostalCode",
    "shippingPhone",
  ] as const;

  const data: Record<string, string | null> = { contractDNI: dni };
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
