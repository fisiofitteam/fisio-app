/**
 * Sanitizador minimalista para el texto formateado de la comunidad.
 *
 * Solo permitimos <b> <strong> <i> <em> <u> <br> (sin atributos). El resto
 * de tags se elimina y su contenido queda como texto plano. Esto cubre
 * negrita/cursiva/subrayado que expone el composer sin abrir la puerta a
 * XSS ni a inserción de scripts, links, imágenes, etc.
 *
 * Como la lista es muy corta usamos regex — cero dependencias. Se llama
 * tanto en cliente (al guardar y al renderizar) como en server (defensa
 * en profundidad al persistir).
 */

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "br"]);

export function sanitizeRichText(input: string): string {
  if (!input) return "";
  // 1. Quitar <script>, <style> y su contenido completo — defensa dura antes
  //    de nada aunque no estén en la whitelist (por si el parser navegador
  //    reordena atributos).
  let s = input.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // 2. Recorrer tags. Los permitidos → normalizados (minúsculas, sin
  //    atributos). Los no permitidos → eliminados (queda su contenido).
  s = s.replace(/<\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_full, tag: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return "";
    // Reconstruimos limpio: <tag> o </tag> (o <br /> autoself-closing).
    const isClosing = _full.trim().startsWith("</");
    if (t === "br") return "<br />";
    return isClosing ? `</${t}>` : `<${t}>`;
  });
  // 3. Bloquear on* handlers embebidos por si algún tag desconocido cuela
  //    (defensa doble; el paso 2 debería haber eliminado el tag entero).
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  return s.trim();
}

/** Devuelve true si el HTML sanitizado no tiene contenido real (solo tags
 *  vacíos o &nbsp;). Se usa para validar composer no vacío. */
export function isRichTextEmpty(html: string): boolean {
  const stripped = html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|\s/g, "");
  return stripped.length === 0;
}
