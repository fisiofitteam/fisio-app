import { NextRequest, NextResponse } from "next/server";

// Esta API es del sistema antiguo de "switch user" para desarrollo.
// SOLO funciona si FISIO_DEV_BYPASS=true. En producción NO está activa.
export async function POST(req: NextRequest) {
  if (process.env.FISIO_DEV_BYPASS !== "true") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }

  const { professionalId, patientId } = await req.json();
  const res = NextResponse.json({ ok: true });
  if (professionalId) {
    res.cookies.set("active-pro-id", professionalId, {
      path: "/", httpOnly: false, maxAge: 60 * 60 * 24 * 30, sameSite: "lax",
    });
    res.cookies.delete("active-patient-id");
  } else if (patientId) {
    res.cookies.set("active-patient-id", patientId, {
      path: "/", httpOnly: false, maxAge: 60 * 60 * 24 * 30, sameSite: "lax",
    });
    res.cookies.delete("active-pro-id");
  } else {
    res.cookies.delete("active-pro-id");
    res.cookies.delete("active-patient-id");
  }
  return res;
}
