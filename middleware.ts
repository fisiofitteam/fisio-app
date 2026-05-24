import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/reset",
  "/paciente/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/forgot",
  "/api/auth/reset",
  "/api/auth/patient-code",
  "/api/auth/patient-verify",
  "/agenda",        // landing pública de reserva
  "/api/agenda",    // endpoints públicos slots + book
  "/contratar",     // landing pública de contratación post-pago
  "/pagar",         // página de gracias tras pago (/pagar/gracias)
  "/api/sale",      // endpoints públicos del flujo de venta (status, checkout, create-account)
  "/renovar",       // landing pública de renovación (paciente existente)
  "/api/renewal",   // endpoints públicos del flujo de renovación (status, checkout)
  "/api/webhooks",  // webhooks externos (Stripe) — los llama Stripe sin cookie
];

const STATIC_PREFIXES = ["/_next", "/api/_internal", "/favicon", "/icon-", "/box.jpg", "/manifest.json"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Estáticos: pasan
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Rutas públicas: pasan
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // En desarrollo, si está activado FISIO_DEV_BYPASS, dejamos pasar TODO
  // (sólo se usa la cookie legacy de "switch user" para identificar al usuario)
  if (process.env.FISIO_DEV_BYPASS === "true") {
    return NextResponse.next();
  }

  // Hay cookie de sesión?
  const session = req.cookies.get("fisio-session");
  if (!session) {
    // Si es ruta paciente → redirige a login paciente
    if (pathname.startsWith("/paciente/")) {
      const url = new URL("/paciente/login", req.url);
      return NextResponse.redirect(url);
    }
    // Resto → login equipo
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // La validez real de la sesión la comprueba cada página/server action.
  // El middleware sólo bloquea peticiones sin cookie alguna.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api/_internal (internals)
     * - _next/static, _next/image (next internals)
     * - favicon, icons
     * - root /
     */
    "/((?!_next/static|_next/image|favicon|icon-|box.jpg|manifest.json).*)",
  ],
};
