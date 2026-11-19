import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordingInput, RECORDING_PREFIX } from "@/lib/recording-rules";
import { requireRecordingPatient, checkRecordingOrigin, recordingToken, RecordingError, recordingFailure } from "@/lib/recordings";
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    checkRecordingOrigin(req);
    const actor = await requireRecordingPatient(params.id);
    recordingToken();
    let data;
    try { data = recordingInput(await req.json()); } catch (e) { throw new RecordingError(400, e instanceof Error ? e.message : "Datos incorrectos."); }
    const path = RECORDING_PREFIX + randomUUID() + "." + (data.mime === "video/mp4" ? "mp4" : "webm");
    const row = await prisma.patientRecording.create({ data: { ...data, patientId: params.id, createdById: actor.id, blobPath: path, status: "uploading", pendingUntil: new Date(Date.now() + 3600000) } });
    return NextResponse.json({ id: row.id, pathname: path }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
