/**
 * GET /api/admin/meet-diagnose?url=https://meet.google.com/xxx-xxxx-xxx
 *
 * Diagnóstico crudo de la API de Google Meet. Solo CEO. Devuelve:
 *   - meetingCode extraído de la URL
 *   - respuesta cruda de GET /conferenceRecords?filter=space.meeting_code="{code}"
 *   - si hay records, respuesta cruda de GET /{recordName}/transcripts
 *   - si hay transcripts, respuesta cruda de GET /{transcriptName}/entries?pageSize=5
 *
 * Con eso vemos exactamente qué contesta Google y por qué el generador
 * de resúmenes no encuentra la transcripción.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getValidAccessToken } from "@/lib/googleCalendar";
import { extractMeetCode } from "@/lib/googleMeet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MEET_API_BASE = "https://meet.googleapis.com/v2";

async function fetchRaw(path: string, token: string) {
  const res = await fetch(`${MEET_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = req.nextUrl.searchParams.get("url") ?? "";
  const code = extractMeetCode(url);
  if (!code) {
    return NextResponse.json({ error: "URL de Meet inválida", url }, { status: 400 });
  }

  const token = await getValidAccessToken();

  // Paso 1: filtrar conferenceRecords por meeting_code
  const filter = encodeURIComponent(`space.meeting_code="${code}"`);
  const step1 = await fetchRaw(`/conferenceRecords?filter=${filter}`, token);

  const result: any = {
    url,
    meetingCode: code,
    tokenPreview: token.slice(0, 12) + "…" + token.slice(-6),
    step1_conferenceRecords: step1,
  };

  const records: Array<{ name: string }> = step1.body?.conferenceRecords ?? [];
  if (records.length === 0) {
    result.diagnosis = "El filtro `space.meeting_code=\"" + code + "\"` no devuelve ningún conferenceRecord. La cuenta OAuth conectada no ve esta reunión — o no fue la organizadora, o el filtro no matchea.";
    // Adicional: listamos los últimos 5 conferenceRecords SIN filtro, para
    // ver qué meeting_codes SÍ ve esta cuenta y comparar.
    const listAll = await fetchRaw(`/conferenceRecords?pageSize=5`, token);
    result.step1b_recentRecordsWithoutFilter = listAll;
    return NextResponse.json(result);
  }

  // Paso 2: por cada record, listar transcripts
  result.step2_transcripts = [];
  for (const rec of records) {
    const transcripts = await fetchRaw(`/${rec.name}/transcripts`, token);
    const perRecord: any = { conferenceRecordName: rec.name, transcripts };

    // Paso 3: por cada transcript, primeros entries
    const trs: Array<{ name: string; state?: string }> = transcripts.body?.transcripts ?? [];
    perRecord.entriesSample = [];
    for (const t of trs) {
      const entries = await fetchRaw(`/${t.name}/entries?pageSize=5`, token);
      perRecord.entriesSample.push({
        transcriptName: t.name,
        state: t.state,
        entries,
      });
    }
    result.step2_transcripts.push(perRecord);
  }

  return NextResponse.json(result);
}
