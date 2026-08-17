/**
 * Cliente de Google Meet REST API v2 para bajar transcripciones de
 * videollamadas.
 *
 * Flujo esperado:
 *   1. Extraer meeting_code del Lead.meetingUrl
 *      (https://meet.google.com/abc-defg-hij  →  abc-defg-hij)
 *   2. Buscar el conferenceRecord asociado al code
 *      (Meet crea un record por cada sesión concreta de esa sala)
 *   3. Listar los transcripts del record y elegir el primero
 *   4. Descargar todos los entries y concatenar en texto plano
 *      ("Speaker: text\n\n") apto para pasar a Claude.
 *
 * Requiere OAuth con scope `meetings.space.readonly`. Los tokens los
 * gestiona `getValidAccessToken()` de googleCalendar.ts (misma cuenta
 * que crea los eventos, que es la organizadora del Meet).
 *
 * Docs: https://developers.google.com/meet/api/reference/rest
 */
import { getValidAccessToken } from "@/lib/googleCalendar";

const MEET_API_BASE = "https://meet.googleapis.com/v2";

export type MeetTranscriptResult = {
  transcriptText: string;
  charCount: number;
  entriesCount: number;
  conferenceRecordName: string;
  transcriptName: string;
};

export class MeetApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function meetFetch<T>(path: string): Promise<T> {
  const token = await getValidAccessToken();
  const res = await fetch(`${MEET_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new MeetApiError(res.status, data, `Meet API ${path} → ${res.status}: ${firstErrorMessage(data) ?? res.statusText}`);
  }
  return data as T;
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function firstErrorMessage(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  if (body.error?.message) return body.error.message;
  if (body.message) return String(body.message);
  return null;
}

/**
 * Extrae el meeting_code de una URL de Google Meet.
 * https://meet.google.com/abc-defg-hij     → abc-defg-hij
 * https://meet.google.com/abc-defg-hij?foo → abc-defg-hij
 */
export function extractMeetCode(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Devuelve TODAS las conferenceRecords asociadas a un meeting_code, ordenadas
 * por DURACIÓN descendente. Un mismo Meet suele tener varias entries cuando
 * la gente entra/sale/reabre; queremos priorizar la más larga porque suele
 * ser la sesión real (las de segundos son "abrí y cerré por error").
 *
 * El caller (fetchTranscriptForMeetingUrl) itera esta lista hasta encontrar
 * una con transcript válido.
 */
export async function findConferenceRecordsForCode(meetingCode: string): Promise<Array<{ name: string; startTime: string; endTime?: string }>> {
  const filter = encodeURIComponent(`space.meeting_code="${meetingCode}"`);
  const data = await meetFetch<{ conferenceRecords?: Array<{ name: string; startTime: string; endTime?: string }> }>(
    `/conferenceRecords?filter=${filter}`,
  );
  const list = data.conferenceRecords ?? [];
  function durationMs(r: { startTime: string; endTime?: string }): number {
    if (!r.endTime) return 0;
    const start = new Date(r.startTime).getTime();
    const end = new Date(r.endTime).getTime();
    return isNaN(start) || isNaN(end) ? 0 : end - start;
  }
  list.sort((a, b) => durationMs(b) - durationMs(a));
  return list;
}

/**
 * Deprecated: mantiene compatibilidad con código existente pero ahora
 * devuelve el conference con MAYOR duración (más probable que sea la
 * sesión real). Preferir `findConferenceRecordsForCode` para poder probar
 * varias si la primera no tiene transcript.
 */
export async function findConferenceRecordForCode(meetingCode: string): Promise<{ name: string; startTime: string; endTime?: string } | null> {
  const list = await findConferenceRecordsForCode(meetingCode);
  return list[0] ?? null;
}

/**
 * Devuelve la transcripción completa de un conferenceRecord como texto
 * plano ("Speaker: what they said\n\n"). Lanza si el record no tiene
 * transcript disponible (aún se está generando o no se activó).
 */
export async function getTranscriptTextForRecord(conferenceRecordName: string): Promise<MeetTranscriptResult> {
  const transcripts = await meetFetch<{ transcripts?: Array<{ name: string; state?: string }> }>(
    `/${conferenceRecordName}/transcripts`,
  );
  const list = transcripts.transcripts ?? [];
  // Priorizamos transcripts LISTOS ("FILE_GENERATED"). Si hay varios listos
  // (por ejemplo, doble activación de Gemini Notes en la misma reunión), los
  // exploramos uno a uno y nos quedamos con el que tenga más entries — así
  // evitamos coger uno vacío o parcial cuando hay otro mejor disponible.
  const readyOnes = list.filter((t) => t.state === "FILE_GENERATED");
  const candidates = readyOnes.length > 0 ? readyOnes : list;
  if (candidates.length === 0) {
    throw new MeetApiError(404, null, "El conferenceRecord no tiene ningún transcript aún.");
  }
  let bestTranscript: { name: string; state?: string } | null = null;
  let bestEntriesCount = -1;
  if (candidates.length === 1) {
    bestTranscript = candidates[0];
  } else {
    for (const t of candidates) {
      try {
        const firstPage = await meetFetch<{ transcriptEntries?: any[] }>(`/${t.name}/entries?pageSize=100`);
        const count = (firstPage.transcriptEntries ?? []).length;
        if (count > bestEntriesCount) {
          bestTranscript = t;
          bestEntriesCount = count;
        }
      } catch {
        // Sigue con los demás candidatos
      }
    }
  }
  const ready = bestTranscript ?? candidates[0];
  if (!ready) {
    throw new MeetApiError(404, null, "El conferenceRecord no tiene ningún transcript aún.");
  }

  // Los entries pueden llegar paginados. Concatenamos siguiendo nextPageToken.
  let pageToken: string | undefined;
  const allEntries: Array<{ text?: string; participant?: string; startTime?: string }> = [];
  do {
    const qs = pageToken ? `?pageSize=1000&pageToken=${encodeURIComponent(pageToken)}` : "?pageSize=1000";
    const page = await meetFetch<{ transcriptEntries?: any[]; nextPageToken?: string }>(
      `/${ready.name}/entries${qs}`,
    );
    if (page.transcriptEntries) allEntries.push(...page.transcriptEntries);
    pageToken = page.nextPageToken;
  } while (pageToken);

  // Formateo: "SpeakerName: contenido" agrupado por participante consecutivo.
  const lines: string[] = [];
  let lastSpeaker: string | null = null;
  for (const e of allEntries) {
    const speaker = (e.participant ?? "").split("/").pop() || "Participante";
    const text = (e.text ?? "").trim();
    if (!text) continue;
    if (speaker !== lastSpeaker) {
      lines.push(`\n${speaker}: ${text}`);
      lastSpeaker = speaker;
    } else {
      lines[lines.length - 1] += ` ${text}`;
    }
  }
  const transcriptText = lines.join("\n").trim();
  return {
    transcriptText,
    charCount: transcriptText.length,
    entriesCount: allEntries.length,
    conferenceRecordName,
    transcriptName: ready.name,
  };
}

export type FetchTranscriptResult =
  | { kind: "found"; transcript: MeetTranscriptResult }
  | { kind: "no_url" }
  | { kind: "no_conference" }   // Meet REST no ve la conference (organizador es otra cuenta)
  | { kind: "no_transcript" };  // Existe la conference pero aún no hay transcript FILE_GENERATED

/**
 * Atajo: dado el meetingUrl de un Lead, devuelve el estado y (si aplica) la
 * transcripción. Distingue "no_conference" (la cuenta OAuth no ve esa Meet
 * porque el organizador es otra cuenta / no fue participante) de
 * "no_transcript" (sí ve la Meet pero aún no publicó transcript).
 */
export async function fetchTranscriptForMeetingUrl(meetingUrl: string | null | undefined): Promise<FetchTranscriptResult> {
  const code = extractMeetCode(meetingUrl);
  if (!code) return { kind: "no_url" };
  const records = await findConferenceRecordsForCode(code);
  if (records.length === 0) return { kind: "no_conference" };
  // Un Meet puede tener varias conference records (la gente reabre por error,
  // sesiones de segundos, etc). Probamos cada una en orden de duración desc
  // y nos quedamos con la primera que devuelva transcript real. Si ninguna
  // tiene transcript, reportamos no_transcript.
  let lastError: unknown = null;
  for (const rec of records) {
    try {
      const transcript = await getTranscriptTextForRecord(rec.name);
      if (transcript.transcriptText) return { kind: "found", transcript };
      // Sin texto → probamos la siguiente conference
    } catch (e) {
      if (e instanceof MeetApiError && e.status === 404) {
        continue; // ese record no tenía transcript, prueba el siguiente
      }
      lastError = e;
    }
  }
  if (lastError) throw lastError;
  return { kind: "no_transcript" };
}
