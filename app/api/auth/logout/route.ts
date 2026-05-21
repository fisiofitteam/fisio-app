import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, clearSessionCookie, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  // Destruir sesión nueva (producción)
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  clearSessionCookie();

  // Borrar también las cookies del "switch user" antiguo (dev local)
  cookies().delete("active-pro-id");
  cookies().delete("active-patient-id");

  return NextResponse.json({ ok: true });
}
