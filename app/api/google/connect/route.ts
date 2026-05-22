import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getActiveProfessional } from "@/lib/session";
import { getAuthUrl } from "@/lib/googleOAuth";

/**
 * GET /api/google/connect
 *
 * Inicia el flujo OAuth: genera un state aleatorio, lo guarda en cookie
 * (HttpOnly, SameSite=Lax) y redirige al usuario a Google.
 *
 * Solo accesible para CEO / Head_success.
 */
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generamos un state aleatorio para prevenir CSRF
  const state = crypto.randomBytes(32).toString("hex");
  const authUrl = getAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  // Guardamos el state en cookie para validarlo en el callback (5 min TTL)
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  });
  return response;
}
