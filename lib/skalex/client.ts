/**
 * Cliente HTTP para la API de datos de Skalex/Zapp.
 *
 * Docs (mensaje del proveedor, 2026-08-07):
 *  - Base URL: https://zapp.skalex.pro/api/v1
 *  - Auth: Authorization: Bearer <apikey>
 *  - Endpoint conocido: GET /conversations?igUsername=... o ?phone=... o
 *    ?name=... o ?igUserId=...
 *  - Rate limit: 300 req/min (429 con retry)
 *  - Máx 50 conversaciones por respuesta, orden desc por lastMessageAt
 *  - Solo lectura.
 *
 * Notas:
 *  - `ai` puede llegar null si Skalex aún no ha analizado.
 *  - `igUserId` es el identificador estable — mejor que igUsername para cruzar.
 */

export type SkalexLabelDto = {
  name: string;
  color?: string | null;
  addedAt: string; // ISO
};

export type SkalexAiDto = {
  phase?: number | null;
  phaseName?: string | null;
  analysis?: string | null;
  nextStepGoal?: string | null;
  updatedAt?: string | null;
};

export type SkalexConversationDto = {
  conversationId: string;
  platform: string;
  customerName?: string | null;
  customerPhone?: string | null;
  igUsername?: string | null;
  igUserId?: string | null;
  labels?: SkalexLabelDto[];
  ai?: SkalexAiDto | null;
  createdAt: string;
  lastMessageAt: string;
};

export type SkalexListResponse = {
  conversations: SkalexConversationDto[];
  requestId?: string;
};

export type SkalexCredentials = {
  apiKey: string;
  baseUrl: string;
};

export function skalexCredentials(): SkalexCredentials | null {
  const apiKey = process.env.SKALEX_API_KEY;
  const baseUrl = process.env.SKALEX_BASE_URL || "https://zapp.skalex.pro/api/v1";
  if (!apiKey) return null;
  return { apiKey, baseUrl };
}

export class SkalexError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Llamada REST autenticada básica. Reintenta una vez ante 429 (rate limit)
 * con backoff corto. Otros errores se propagan.
 */
async function skalexFetch<T>(path: string, query: Record<string, string>): Promise<T> {
  const creds = skalexCredentials();
  if (!creds) throw new Error("SKALEX_API_KEY no está configurada.");

  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${creds.baseUrl}${path}${qs ? `?${qs}` : ""}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        Accept: "application/json",
      },
    });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      throw new SkalexError(res.status, data, `Skalex GET ${path} → ${res.status}`);
    }
    return data as T;
  }
  throw new SkalexError(429, null, `Skalex GET ${path} → rate limit persistente`);
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/**
 * Busca conversaciones por Instagram username. Skalex ignora el "@" y
 * mayúsculas. Devuelve hasta 50, ordenadas por lastMessageAt desc.
 */
export async function findByIgUsername(igUsername: string): Promise<SkalexConversationDto[]> {
  const data = await skalexFetch<SkalexListResponse>("/conversations", { igUsername });
  return data.conversations ?? [];
}

/**
 * Busca conversaciones por Instagram user_id (IGSID). Es el identificador
 * más estable y el mejor para cruzar con nuestros Lead/Patient.
 */
export async function findByIgUserId(igUserId: string): Promise<SkalexConversationDto[]> {
  const data = await skalexFetch<SkalexListResponse>("/conversations", { igUserId });
  return data.conversations ?? [];
}

/**
 * Busca por teléfono. Skalex ignora +, espacios y guiones. Formato
 * internacional recomendado (p.ej. 34600111222).
 */
export async function findByPhone(phone: string): Promise<SkalexConversationDto[]> {
  const data = await skalexFetch<SkalexListResponse>("/conversations", { phone });
  return data.conversations ?? [];
}

/**
 * Búsqueda parcial por nombre (mínimo 3 caracteres). Puede devolver varios.
 * Útil como fallback cuando no hay ig ni phone; peligroso para automatizar.
 */
export async function findByName(name: string): Promise<SkalexConversationDto[]> {
  if (name.trim().length < 3) return [];
  const data = await skalexFetch<SkalexListResponse>("/conversations", { name: name.trim() });
  return data.conversations ?? [];
}
