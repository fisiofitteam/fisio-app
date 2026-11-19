export const MAX_RECORDING_BYTES = 500 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 30 * 60;
export const RECORDING_PREFIX = "professional-recordings/";
export const RECORDING_MIMES = ["video/mp4", "video/webm"];
export function recordingInput(value: unknown) {
  const b = value as Record<string, unknown> | null;
  if (!b || typeof b.title !== "string" || !b.title.trim() || b.title.trim().length > 160) throw new Error("Introduce un título de hasta 160 caracteres.");
  if (typeof b.mime !== "string" || !RECORDING_MIMES.includes(b.mime)) throw new Error("Formato de vídeo no admitido.");
  if (typeof b.size !== "number" || !Number.isInteger(b.size) || b.size < 1 || b.size > MAX_RECORDING_BYTES) throw new Error("La grabación debe ocupar entre 1 byte y 500 MB.");
  if (typeof b.durationSeconds !== "number" || !Number.isFinite(b.durationSeconds) || b.durationSeconds < 0 || b.durationSeconds > MAX_RECORDING_SECONDS + 10) throw new Error("Duración no válida.");
  const notes = typeof b.notes === "string" ? b.notes.trim() : "";
  if (notes.length > 5000) throw new Error("Las notas no pueden superar 5000 caracteres.");
  return { title: b.title.trim(), mime: b.mime, size: b.size, durationSeconds: Math.ceil(b.durationSeconds), notes: notes || null };
}
export function recordingBlobUrl(raw: string, pathname: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && !u.search && !u.hash &&
      /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(u.hostname) &&
      pathname.startsWith(RECORDING_PREFIX) && u.pathname === "/" + pathname ? u : null;
  } catch { return null; }
}
export const validRecordingShare = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
