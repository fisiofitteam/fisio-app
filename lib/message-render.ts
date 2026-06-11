// Helpers para interpolar plantillas de mensaje y abrir WhatsApp.
// Server-safe (no usa nada del DOM). El componente cliente que abre la ventana
// hace `window.open(buildWhatsAppUrl(...))`.

/**
 * Sustituye {variable} y {a.b} por su valor en `vars`. Tokens sin valor se
 * dejan en blanco (no rompen el mensaje) y la línea queda colapsada si era
 * la única ahí — el caller ya escribe el texto pensando en eso.
 */
export function interpolate(template: string, vars: Record<string, string | undefined | null>): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/**
 * Normaliza un teléfono al formato que acepta wa.me: solo dígitos, sin "+".
 * Asume que el número ya viene con prefijo internacional (la app guarda así).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits || null;
}

/**
 * Construye la URL wa.me con el mensaje url-encoded. Devuelve null si no hay
 * teléfono válido (el caller debería mostrar un aviso al closer en ese caso).
 */
export function buildWhatsAppUrl(phone: string | null | undefined, text: string): string | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
