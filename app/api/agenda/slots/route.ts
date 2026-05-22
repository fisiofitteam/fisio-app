/**
 * GET /api/agenda/slots
 *
 * Público (sin auth). Devuelve los slots libres para reservar.
 * Lo usa la landing para mostrar el calendario.
 */
import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/agendaSlots";

export async function GET() {
  try {
    const slots = await getAvailableSlots();
    return NextResponse.json({ ok: true, slots });
  } catch (e: any) {
    console.error("Get slots error:", e);
    return NextResponse.json(
      { ok: false, error: e.message || "No se pudieron cargar los slots" },
      { status: 500 }
    );
  }
}
