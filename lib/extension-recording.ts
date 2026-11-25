import { recordingInput } from "./recording-rules";
import type { TranscriptStatus } from "./browser-transcription";
export const EXTENSION_CHUNK_SIZE = 512 * 1024;
export type ExtensionLink = { extension: string; transfer: string };
export function extensionLink(hash: string): ExtensionLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, "")), extension = params.get("extension"), transfer = params.get("transfer");
  return extension && /^[a-p]{32}$/.test(extension) && transfer && /^[0-9a-f-]{72}$/.test(transfer) ? { extension, transfer } : null;
}
export function extensionMetadata(value: unknown) {
  const b = value as Record<string, unknown>;
  const input = recordingInput(b);
  if (typeof b.id !== "string" || !/^[0-9a-f-]{36}$/.test(b.id) || b.chunkSize !== EXTENSION_CHUNK_SIZE) throw Error("La extensión ha enviado una grabación no válida.");
  for (const field of ["reason", "transcriptionWarning"]) if (b[field] != null && (typeof b[field] !== "string" || (b[field] as string).length > 2000)) throw Error("Metadatos de grabación no válidos.");
  return { ...input, id: b.id, reason: (b.reason as string) || "", transcriptionWarning: (b.transcriptionWarning as string) || "", transcriptionStatus: input.transcriptionStatus as TranscriptStatus };
}
export function extensionChunk(value: unknown, offset: number, size: number) {
  const b = value as { offset?: unknown; length?: unknown; data?: unknown } | null;
  const expected = Math.min(EXTENSION_CHUNK_SIZE, size - offset);
  if (!b || b.offset !== offset || b.length !== expected || typeof b.data !== "string" || b.data.length > Math.ceil(expected / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)) throw Error("Ha fallado la transferencia. Vuelve a recibir la grabación.");
  const binary = atob(b.data); if (binary.length !== expected) throw Error("Fragmento incompleto.");
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
