import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getActiveProfessional } from "@/lib/session";
import { getAuthUrl } from "@/lib/googleOAuth";

/**
 * GET /api/google/connect[?mode=personal]
 *
 * Inicia el flujo OAuth. Guarda en cookie el state + el modo (organizational/personal):
 *  - organizational (default): la conexión compartida videoconsultas@fisiofitteam.com.
 *    Solo CEO/head_success pueden hacerla.
 *  - personal: la conexión propia del fisio logueado, se guarda con
 *    professionalId=<user.id>. Cualquier miembro con rol activo puede.
 *
 * El callback lee el modo desde la cookie y decide dónde guardar el registro.
 */
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const mode = req.nextUrl.searchParams.get("mode") === "personal" ? "personal" : "organizational";
  if (mode === "organizational" && !(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generamos un state aleatorio para prevenir CSRF
  const state = crypto.randomBytes(32).toString("hex");
  const authUrl = getAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  });
  response.cookies.set("google_oauth_mode", mode, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  });
  return response;
}
