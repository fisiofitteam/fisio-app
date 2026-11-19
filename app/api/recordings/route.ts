import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getRecordingLibrary } from "@/lib/recording-library";
import { reserveRecording } from "@/lib/recording-reservations";
import { checkRecordingOrigin, recordingFailure } from "@/lib/recordings";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams;
    const result = await getRecordingLibrary(await getActiveProfessional(), {
      folderId: query.get("folderId") || "", q: query.get("q") || "", patientId: query.get("patientId") || "", page: query.get("page") || "1",
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}

export async function POST(req: NextRequest) {
  try {
    checkRecordingOrigin(req);
    return NextResponse.json(await reserveRecording(await req.json()), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
