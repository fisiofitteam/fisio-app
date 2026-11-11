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
  "/acceso",        // magic link 1-clic del paciente (/acceso/[token]) — el
                    //   propio route handler crea la sesión y redirige; si
                    //   el middleware lo bloquea, el handler nunca corre.
  "/agenda",        // landing pública de reserva (legacy)
  "/api/agenda",    // endpoints públicos slots + book (legacy)
  "/agendar-fisio", // landing pública de reserva de llamada del fisio
                    //   (/agendar-fisio/[token]) — el paciente accede
                    //   con un link generado desde la ficha.
  "/api/booking",   // endpoints públicos slots + reserve del flujo
                    //   /agendar-fisio (usados por la landing sin sesión).
  "/contratar",     // landing pública de contratación post-pago
  "/pagar",         // página de gracias tras pago (/pagar/gracias)
  "/api/sale",      // endpoints públicos del flujo de venta (status, checkout, create-account)
  "/renovar",       // landing pública de renovación (paciente existente)
  "/api/renewal",   // endpoints públicos del flujo de renovación (status, checkout)
  "/prevention",    // landing pública Prevention + páginas de gracias
  "/api/prevention",// endpoints públicos del flujo Prevention (checkout, confirm)
  "/api/assessments/upload", // Blob callback verifies signature; token requests require the assigned patient.
  "/api/webhooks",  // webhooks externos (Stripe) — los llama Stripe sin cookie
  "/api/cron/installment-reconcile", // autentica CRON_SECRET en el handler; Vercel no envía cookie de equipo
  "/privacidad",    // política de privacidad pública (requerida por App Store)
  "/terminos",     // términos y condiciones públicos
  "/eliminar-cuenta", // instrucciones de borrado de cuenta (requerida por Google Play)
  "/semaforo",      // lead magnet "El Semáforo del Hombro" — landing pública
                    //   sin login, distribuido por Instagram/Skalex.
  "/api/semaforo",  // endpoints del semáforo (create, update, whatsapp click)
  "/autotest-hombro",     // lead magnet "Autotest Funcional del Hombro para CrossFit"
  "/api/autotest-hombro", // endpoints del autotest (create, update, whatsapp click)
];

const STATIC_PREFIXES = ["/_next", "/api/_internal", "/favicon", "/icon-", "/box.jpg", "/manifest.json"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // A capability opens exactly one view, never a public API subtree. Do not redirect
  // malformed links to a login URL containing a copy of the bearer token.
  if (pathname === "/informe-hombro" || pathname.startsWith("/informe-hombro/")) {
    const ok = /^\/informe-hombro\/[A-Za-z0-9_-]{43}\/?$/.test(pathname);
    const res = ok && (req.method === "GET" || req.method === "HEAD")
      ? NextResponse.next() : new NextResponse("Informe no disponible.", {status:404});
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    return res;
  }

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
