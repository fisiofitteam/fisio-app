import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { exchangeCodeForTokens, getUserInfo } from "@/lib/googleOAuth";
import { encrypt } from "@/lib/encryption";

/**
 * GET /api/google/callback?code=...&state=...
 *
 * Google nos redirige aquí tras autorizar. Validamos el state, intercambiamos
 * el code por tokens, obtenemos el email, y guardamos todo cifrado.
 */
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const modeCookie = req.cookies.get("google_oauth_mode")?.value;
  const mode: "organizational" | "personal" = modeCookie === "personal" ? "personal" : "organizational";

  // Organizational solo CEO/head_success. Personal cualquier miembro logueado.
  if (mode === "organizational" && !(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Si el usuario rechazó la autorización en Google
  if (error) {
    return NextResponse.redirect(
      new URL(`/fisio/ajustes/integraciones?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/fisio/ajustes/integraciones?error=missing_code", req.url)
    );
  }

  // Validar state contra cookie (anti-CSRF)
  const cookieState = req.cookies.get("google_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      new URL("/fisio/ajustes/integraciones?error=invalid_state", req.url)
    );
  }

  try {
    // 1. Intercambiar code por tokens
    const tokens = await exchangeCodeForTokens(code);

    // 2. Obtener email/nombre del usuario que autorizó
    const userInfo = await getUserInfo(tokens.access_token);

    // 3. Calcular fecha de expiración del access_token
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // 4. Encriptar y guardar
    const accessTokenEnc = encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    // Upsert por tipo de conexión:
    //  - personal → clave = professionalId (una por fisio)
    //  - organizational → clave = googleEmail (la global, sin professionalId)
    if (mode === "personal") {
      // Si el fisio ya tenía conexión personal previa, la reemplazamos.
      // Si no, la creamos. Nunca colisiona con la organizacional porque
      // esta última tiene professionalId=null.
      const existing = await prisma.googleCalendarConnection.findFirst({
        where: { professionalId: user.id },
        select: { id: true },
      });
      if (existing) {
        await prisma.googleCalendarConnection.update({
          where: { id: existing.id },
          data: {
            googleEmail: userInfo.email,
            googleName: userInfo.name,
            accessTokenEnc,
            ...(refreshTokenEnc && { refreshTokenEnc }),
            tokenExpiresAt: expiresAt,
            scopes: tokens.scope,
          },
        });
      } else {
        // Si el email ya está tomado por la organizacional o por otro fisio,
        // no podemos crear otro con el mismo email (googleEmail es @unique).
        // Ese caso se resuelve pidiendo al fisio que use su cuenta personal.
        await prisma.googleCalendarConnection.create({
          data: {
            googleEmail: userInfo.email,
            googleName: userInfo.name,
            professionalId: user.id,
            connectedById: user.id,
            accessTokenEnc,
            refreshTokenEnc,
            tokenExpiresAt: expiresAt,
            scopes: tokens.scope,
          },
        });
      }
    } else {
      // organizational: comportamiento clásico (una por email).
      await prisma.googleCalendarConnection.upsert({
        where: { googleEmail: userInfo.email },
        create: {
          googleEmail: userInfo.email,
          googleName: userInfo.name,
          connectedById: user.id,
          accessTokenEnc,
          refreshTokenEnc,
          tokenExpiresAt: expiresAt,
          scopes: tokens.scope,
        },
        update: {
          googleName: userInfo.name,
          connectedById: user.id,
          accessTokenEnc,
          ...(refreshTokenEnc && { refreshTokenEnc }),
          tokenExpiresAt: expiresAt,
          scopes: tokens.scope,
        },
      });
    }

    // 5. Limpiar cookies y redirigir a ajustes con éxito
    const response = NextResponse.redirect(
      new URL(`/fisio/ajustes/integraciones?connected=1&mode=${mode}`, req.url)
    );
    response.cookies.delete("google_oauth_state");
    response.cookies.delete("google_oauth_mode");
    return response;
  } catch (e: any) {
    console.error("Google OAuth callback error:", e);
    return NextResponse.redirect(
      new URL(`/fisio/ajustes/integraciones?error=${encodeURIComponent(e.message || "unknown")}`, req.url)
    );
  }
}
