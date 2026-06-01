/**
 * GET /api/agenda/slots
 *
 * Público (sin auth). Devuelve los slots libres para reservar.
 * Lo usa la landing para mostrar el calendario.
 *
 * IMPORTANTE: marcado como dinámico para que NO se cachee. Cualquier cambio
 * en la plantilla o en overrides debe reflejarse inmediatamente en la landing.
 */
import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/agendaSlots";

// Forzar renderizado dinámico (sin caché de Next.js ni de Vercel)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const slots = await getAvailableSlots();
    return new NextResponse(JSON.stringify({ ok: true, slots }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache-Control: nunca cachear, ni en CDN ni en navegador
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (e: any) {
    console.error("Get slots error:", e);
    return NextResponse.json(
      { ok: false, error: e.message || "No se pudieron cargar los slots" },
      { status: 500 }
    );
  }
}
