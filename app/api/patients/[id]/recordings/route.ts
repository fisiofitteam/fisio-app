import { NextRequest, NextResponse } from "next/server";
import { reserveRecording } from "@/lib/recording-reservations";
import { checkRecordingOrigin, recordingFailure } from "@/lib/recordings";
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    checkRecordingOrigin(req);
    return NextResponse.json(await reserveRecording(await req.json(), params.id), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
