/**
 * Configuración del lead magnet "El Semáforo del Hombro". Todo lo que
 * puede cambiar sin tocar lógica vive aquí: WhatsApp, vídeos por
 * resultado, nombre del parámetro que trae el usuario de Instagram,
 * versión y texto de consentimiento, y el flag legal.
 */

/** Número de WhatsApp de Ales, formato internacional SIN "+". Lo
 *  ponemos en env var pública para poder cambiarlo desde Vercel sin
 *  redeploy de código. */
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_SEMAFORO_WHATSAPP ?? "";

/** Nombre del parámetro querystring que trae el usuario de Instagram.
 *  Skalex aún no ha confirmado la sintaxis exacta — cambia solo aquí. */
export const IG_PARAM_NAME = "ig";

/** Nombre del parámetro de campaña (?c=). Texto libre para saber de
 *  qué reel/anuncio viene cada respuesta. */
export const CAMPAIGN_PARAM_NAME = "c";

/** Vídeos por color y para la pantalla de alarma. URL de embed
 *  (YouTube: https://www.youtube.com/embed/ID, Vimeo:
 *  https://player.vimeo.com/video/ID) o un .mp4. Vacío = placeholder,
 *  no rompe la UI. */
export const VIDEO_URLS: Record<"verde" | "ambar" | "rojo" | "alarma", string> = {
  verde: "",
  ambar: "",
  rojo: "",
  alarma: "",
};

/** Versión del texto de consentimiento. Cada vez que cambie el copy,
 *  incrementa la versión y cada nueva respuesta guardará la que aceptó
 *  — así queda trazabilidad legal a nivel de fila. */
export const CONSENT_VERSION = "semaforo-v1";

/** Texto exacto de la casilla de consentimiento. Cambiarlo obliga a
 *  subir CONSENT_VERSION. */
export const CONSENT_TEXT =
  "Acepto que FisioFitCross guarde mis respuestas, que incluyen información sobre mi salud, para valorar mi caso y contactarme.";

/** Mientras esté en false, el panel /fisio/semaforo pinta un aviso
 *  recordando que los textos legales están pendientes de revisar. En
 *  la landing pública NO se muestra nada. */
export const LEGAL_REVISADO = false;

/** URL de la política de privacidad — ya existe /privacidad en la app. */
export const PRIVACY_URL = "/privacidad";

/** Validación de handle de Instagram: acepta con o sin @; devuelve el
 *  handle limpio o null si es inválido o parece una variable sin
 *  sustituir (empieza con {{, {, %7B). */
export function sanitizeInstagram(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Variable de plantilla sin sustituir (Skalex/otros).
  if (/^(\{\{|\{|%7[bB])/.test(trimmed)) return null;
  const withoutAt = trimmed.replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(withoutAt) ? withoutAt : null;
}

/** Saneo de la campaña — texto libre, máx 50 chars, sin control chars. */
export function sanitizeCampaign(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[\x00-\x1f\x7f]/g, "").slice(0, 50);
  return cleaned || null;
}
