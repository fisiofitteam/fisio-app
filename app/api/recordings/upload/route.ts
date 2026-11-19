import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { checkRecordingOrigin, requireRecording, recordingToken, finishRecording, recordingFailure, RecordingError } from "@/lib/recordings";
import { RECORDING_PREFIX } from "@/lib/recording-rules";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const token = recordingToken();
    const body = await req.json() as HandleUploadBody;
    return NextResponse.json(await handleUpload({
      body, request: req, token,
      onBeforeGenerateToken: async (pathname, payload) => {
        checkRecordingOrigin(req);
        const p = JSON.parse(payload || "{}");
        if (typeof p.id !== "string") throw new RecordingError(400, "Falta la grabación.");
        const { row, actor } = await requireRecording(p.id);
        if (row.createdById !== actor.id || row.status !== "uploading" || row.blobPath !== pathname || !row.pendingUntil || row.pendingUntil < new Date() || !row.mime || !row.size)
          throw new RecordingError(409, "La subida ha caducado o no te pertenece.");
        return { allowedContentTypes: [row.mime], maximumSizeInBytes: row.size, addRandomSuffix: false, allowOverwrite: false,
          validUntil: row.pendingUntil.getTime(), tokenPayload: JSON.stringify({ id: row.id, pathname }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const p = JSON.parse(tokenPayload || "{}");
        if (typeof p.id !== "string" || typeof p.pathname !== "string" || !p.pathname.startsWith(RECORDING_PREFIX) || blob.pathname !== p.pathname)
          throw new Error("Invalid recording callback");
        const ok = await finishRecording(p.id, p.pathname);
        if (!ok) {
          const row = await prisma.patientRecording.findUnique({ where: { id: p.id } });
          if (!row || row.status === "deleting" || row.pendingUntil && row.pendingUntil < new Date())
            await del(p.pathname, { token });
        }
      },
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
