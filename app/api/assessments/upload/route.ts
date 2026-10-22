import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { assignedAssessment, finishAssessmentUpload } from "@/lib/assessment-access";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    if (!process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "El almacenamiento de valoraciones todavía no está configurado." }, { status: 503 });
    const body = await req.json() as HandleUploadBody;
    return NextResponse.json(await handleUpload({
      body, request: req, token: process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, payload) => {
        const { id } = JSON.parse(payload || "{}");
        const row = typeof id === "string" ? await prisma.assessmentVideo.findUnique({ where: { id } }) : null;
        if (!row?.sessionId || row.reviewedAt || row.pendingPath !== pathname || !row.pendingUntil || row.pendingUntil < new Date() || !row.pendingMime || !row.pendingSize) throw new Error("Subida no disponible.");
        await assignedAssessment(row.sessionId, row.taskId, row.testId);
        return { allowedContentTypes: [row.pendingMime], maximumSizeInBytes: row.pendingSize, addRandomSuffix: false, allowOverwrite: false,
          validUntil: row.pendingUntil.getTime(), tokenPayload: JSON.stringify({ id: row.id, pathname }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const p = JSON.parse(tokenPayload || "{}");
        if (blob.pathname !== p.pathname) throw new Error("Ruta no válida.");
        await finishAssessmentUpload(p.id, p.pathname);
      },
    }));
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo subir el vídeo." }, { status: 400 }); }
}
