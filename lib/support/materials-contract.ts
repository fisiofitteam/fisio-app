import { z } from "zod";

export const SUPPORT_FILE_LIMIT = 100 * 1024 * 1024;
export const SUPPORT_MATERIAL_LIMIT = 8;
export const SUPPORT_FILE_TYPES = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/webm": "webm",
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
} as const;
export type SupportFileMime = keyof typeof SUPPORT_FILE_TYPES;
export const SUPPORT_FILE_ACCEPT = Object.keys(SUPPORT_FILE_TYPES).join(",");
export function supportFileMime(file: { name: string; type: string }): SupportFileMime | null {
  if (Object.hasOwn(SUPPORT_FILE_TYPES, file.type)) return file.type as SupportFileMime;
  // Some browsers omit MIME for local documents; derive only a known extension.
  if (file.type && file.type !== "application/octet-stream") return null;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (Object.entries(SUPPORT_FILE_TYPES).find(([, value]) => value === ext || ext === "jpeg" && value === "jpg")?.[0] as SupportFileMime) || null;
}
export function supportWebUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === "https:" && !!u.hostname && !u.username && !u.password; } catch { return false; }
}
export const supportLinkSchema = z.object({ title: z.string().trim().max(120).default(""), url: z.string().trim().max(1800).refine(supportWebUrl) }).strict();
export const materialsSchema = {
  attachmentIds: z.array(z.string().uuid()).max(SUPPORT_MATERIAL_LIMIT).refine(ids => new Set(ids).size === ids.length).default([]),
  links: z.array(supportLinkSchema).max(SUPPORT_MATERIAL_LIMIT).default([]),
};
export const reserveSupportFileSchema = z.object({
  name: z.string().trim().min(1).max(200).refine(name => !/[\x00-\x1f\x7f]/.test(name)),
  mime: z.string().refine((mime): mime is SupportFileMime => Object.hasOwn(SUPPORT_FILE_TYPES, mime)),
  size: z.number().int().min(1).max(SUPPORT_FILE_LIMIT),
}).strict();
export type SupportFile = { id: string; name: string; mime: string; size: number; href: string };
export type SupportMaterialLink = z.infer<typeof supportLinkSchema>;
