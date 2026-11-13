import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { ReservationConflict, registerManualReservation } from "@/lib/initial-reservation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getActiveProfessional();
  if (!actor) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (
    !b ||
    typeof b !== "object" ||
    Array.isArray(b) ||
    Object.keys(b).some(
      (k) => !["email", "assignedProfessionalId", "amountEuros", "paymentMethod", "programType"].includes(k),
    )
  )
    return NextResponse.json({ error: "Datos de reserva no válidos." }, { status: 400 });
  try {
    const result = await registerManualReservation(params.id, actor, b);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof ReservationConflict)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "No se ha podido guardar la reserva." }, { status: 500 });
  }
}
