/**
 * Helpers para el flujo OAuth 2.0 con Google.
 *
 * Documentación oficial:
 *  https://developers.google.com/identity/protocols/oauth2/web-server
 *
 * Scopes que pedimos:
 *  - userinfo.email + userinfo.profile: para identificar la cuenta conectada
 *  - calendar + calendar.events: para leer y crear eventos en Calendar
 *  - meetings.space.readonly: para leer conferenceRecords + transcripts de
 *    Google Meet (necesario para generar el resumen IA de la llamada de venta).
 *  - drive.readonly: fallback para leer los archivos .txt/.docx de transcripción
 *    que Meet sube a Drive del organizador cuando la sesión termina.
 *
 * Al ampliar scopes se requiere que el CEO re-autorice desde Ajustes.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} env var not set`);
  return v;
}

/**
 * Genera la URL a la que redirigir al usuario para iniciar el flujo OAuth.
 * El `state` es un valor random opaco que validamos en el callback para
 * prevenir CSRF.
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",   // necesario para obtener refresh_token
    prompt: "consent",        // fuerza pantalla de consentimiento (siempre devuelve refresh_token)
    state,
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;     // solo en la primera autorización
  expires_in: number;          // segundos hasta expiración (típicamente 3600)
  scope: string;
  token_type: string;          // siempre "Bearer"
  id_token?: string;           // JWT con info del usuario
};

/**
 * Intercambia el `code` recibido en el callback por tokens reales.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Refresca el access_token usando el refresh_token guardado.
 * El refresh_token sigue siendo válido y se reutiliza.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

export type GoogleUserInfo = {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  picture?: string;
};

/**
 * Obtiene el email/nombre del usuario que acaba de autorizar.
 */
export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get userinfo failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Revoca el token (al desconectar). Mejor práctica: avisar a Google de que
 * ya no usaremos esa autorización.
 */
export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).catch(() => {
    // No fallar si Google ya lo revocó por su cuenta
  });
}
