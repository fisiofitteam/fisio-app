// Helpers para interpolar plantillas de mensaje y abrir WhatsApp.
// Server-safe (no usa nada del DOM). El componente cliente que abre la ventana
// hace `window.open(buildWhatsAppUrl(...))`.

/**
 * Sustituye {variable} y {a.b} por su valor en `vars`. Tokens sin valor se
 * dejan en blanco (no rompen el mensaje) y la línea queda colapsada si era
 * la única ahí — el caller ya escribe el texto pensando en eso.
 *
 * NFC-normaliza el resultado para que los emojis con variation selectors
 * (U+FE0F) lleguen intactos al destino (WhatsApp es especialmente sensible).
 */
export function interpolate(template: string, vars: Record<string, string | undefined | null>): string {
  const out = template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
  // normalize devuelve undefined si no está disponible (entornos antiguos),
  // por eso el try.
  try { return out.normalize("NFC"); } catch { return out; }
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
