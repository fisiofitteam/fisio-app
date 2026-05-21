// Extrae el ID de un vídeo de YouTube desde URL o devuelve el ID si ya lo es.
export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();

  // Si parece ya un ID (11 chars alfanuméricos)
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  // Patrones comunes
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,           // ?v=ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,      // youtu.be/ID
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/, // embed/ID
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/, // shorts/ID
  ];

  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }

  return null;
}

export function youtubeEmbedUrl(input: string): string | null {
  const id = extractYouTubeId(input);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

export function youtubeThumbnail(input: string): string | null {
  const id = extractYouTubeId(input);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}
