// Helpers para interpolar plantillas de mensaje y abrir WhatsApp.
// Server-safe (no usa nada del DOM). El componente cliente que abre la ventana
// hace `window.open(buildWhatsAppUrl(...))`.

/**
 * Sustituye {variable} y {a.b} por su valor en `vars`. Si la key está en `vars`
 * pero su valor es nulo/vacío, se sustituye por "". Si la key NO está en `vars`,
 * se mantiene el token literal — útil para interpolar parcialmente (p.ej. al
 * copiar al portapapeles solo sustituimos las variables del usuario, dejando
 * {nombre} para que se rellene a mano en WhatsApp).
 *
 * NFC-normaliza el resultado para que los emojis con variation selectors
 * (U+FE0F) lleguen intactos al destino (WhatsApp es especialmente sensible).
 */
export function interpolate(template: string, vars: Record<string, string | undefined | null>): string {
  const out = template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, key) => {
    if (!(key in vars)) return match; // token no provisto → lo dejamos literal
    const v = vars[key];
    return v == null ? "" : String(v);
  });
  try { return out.normalize("NFC"); } catch { return out; }
}

/**
 * Variables del usuario logueado. Para `{closer}`, `{fisio}` (alias),
 * `{closer.intro}` y `{fisio.intro}` (alias). Se usan al copiar al portapapeles
 * en Recursos > Mensajes y como base en los flujos de envío directo.
 */
export function varsForCurrentUser(
  fullName: string,
  closerIntro: string | null,
): Record<string, string> {
  return {
    closer: fullName,
    fisio: fullName,
    "closer.intro": closerIntro ?? "",
    "fisio.intro": closerIntro ?? "",
  };
}

/**
 * Normaliza un teléfono al formato que acepta WhatsApp: solo dígitos, sin "+".
 * Asume que el número ya viene con prefijo internacional (la app guarda así).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits || null;
}

/**
 * Construye la URL de WhatsApp con el mensaje. Devuelve null si no hay
 * teléfono válido (el caller debería mostrar un aviso al closer en ese caso).
 *
 * Usamos api.whatsapp.com/send en vez de wa.me porque WhatsApp Desktop tiene
 * reportes de problemas decodificando emojis en wa.me (les pierde el variation
 * selector). api.whatsapp.com es el endpoint clásico y mantiene mejor el UTF-8.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, text: string): string | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://api.whatsapp.com/send?phone=${p}&text=${encodeURIComponent(text)}`;
}
