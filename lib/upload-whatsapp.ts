"use client";
export async function uploadWhatsApp(file: File, fields: { patientId?: string | null; title?: string; notes?: string; bodyZone?: string | null }, progress: (message: string) => void) {
  if (!file.name.toLowerCase().endsWith(".txt") || !file.size || file.size > 50 * 1024 * 1024) throw new Error("Selecciona un TXT de hasta 50 MB.");
  progress("Leyendo conversación…");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); }
  catch { throw new Error("El TXT debe estar codificado en UTF-8. Exporta el chat de nuevo desde WhatsApp."); }
  if (!text.trim() || text.includes("\u0000")) throw new Error("El TXT está vacío o no contiene texto válido.");
  const encoder = new TextEncoder();
  const size = encoder.encode(text).byteLength;
  const response = await fetch("/api/testimonials", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...fields, name: file.name, kind: "whatsapp", chunked: true, size }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo preparar la conversación.");
  let offset = 0;
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 128 * 1024, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    const chunk = text.slice(start, end);
    const res = await fetch("/api/testimonials/" + data.id + "/text", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, chunk }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Se interrumpió la subida. Vuelve a seleccionar el TXT.");
    offset += encoder.encode(chunk).byteLength; start = end;
    progress("Guardando conversación · " + Math.round(offset / size * 100) + "%");
  }
  return data.id as string;
}
