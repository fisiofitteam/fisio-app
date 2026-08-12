// Helpers para incrustar vídeos de YouTube, Vimeo o Loom a partir de un enlace/ID.
import { extractYouTubeId } from "./youtube";

export type VideoInfo = {
  provider: "youtube" | "vimeo" | "loom" | null;
  id: string | null;
  embedUrl: string | null;
  thumbnail: string | null;
};

function extractVimeoId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  // vimeo.com/123456789  | player.vimeo.com/video/123456789
  const m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return m[1];
  // ID numérico suelto
  if (/^\d{6,}$/.test(s)) return s;
  return null;
}

function extractLoomId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  // loom.com/share/{id} | loom.com/embed/{id} — el id es hex de ~32 chars.
  // Puede llevar query params (?t=…, ?sid=…) que ignoramos.
  const m = s.match(/loom\.com\/(?:share|embed)\/([a-f0-9]{16,})/i);
  if (m) return m[1];
  return null;
}

export function parseVideo(input: string): VideoInfo {
  if (!input) return { provider: null, id: null, embedUrl: null, thumbnail: null };
  const s = input.trim();

  // Loom: enlace share o embed
  if (/loom\.com/.test(s)) {
    const id = extractLoomId(s);
    return {
      provider: id ? "loom" : null,
      id,
      embedUrl: id ? `https://www.loom.com/embed/${id}` : null,
      thumbnail: null, // Loom no expone miniatura sin API
    };
  }

  // Vimeo si el enlace lo menciona explícitamente
  if (/vimeo\.com/.test(s)) {
    const id = extractVimeoId(s);
    return {
      provider: id ? "vimeo" : null,
      id,
      embedUrl: id ? `https://player.vimeo.com/video/${id}` : null,
      thumbnail: null, // Vimeo requiere oEmbed para miniatura; lo omitimos
    };
  }

  // YouTube (por defecto)
  const ytId = extractYouTubeId(s);
  if (ytId) {
    return {
      provider: "youtube",
      id: ytId,
      embedUrl: `https://www.youtube.com/embed/${ytId}`,
      thumbnail: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`,
    };
  }

  return { provider: null, id: null, embedUrl: null, thumbnail: null };
}

export function videoEmbedUrl(input: string): string | null {
  return parseVideo(input).embedUrl;
}

export function videoThumbnail(input: string): string | null {
  return parseVideo(input).thumbnail;
}
