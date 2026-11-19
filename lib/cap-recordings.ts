export function capServerUrl(): string | null {
  try {
    const url = new URL(process.env.CAP_SERVER_URL || "");
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}
export function validateRecording(input: unknown) {
  const body = input as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 160) throw new Error("Introduce un título de hasta 160 caracteres.");
  if (typeof body.url !== "string" || body.url.length > 2048) throw new Error("Introduce el enlace de Cap.");
  const url = new URL(body.url);
  const allowed = new Set(["https://cap.so", "https://cap.link", capServerUrl()].filter(Boolean));
  if (url.protocol !== "https:" || !allowed.has(url.origin) || url.username || url.password || url.pathname === "/") throw new Error("Utiliza un enlace de Cap o del servidor configurado.");
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > 5000) throw new Error("Las notas no pueden superar 5000 caracteres.");
  return { title: body.title.trim(), url: url.href, notes: notes || null };
}
