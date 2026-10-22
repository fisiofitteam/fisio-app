import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { canAccessEvidence, MAX_EVIDENCE_BYTES } from "@/lib/patient-evidence";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Almacenamiento no configurado" }, { status: 503 });
  try {
    const body = await req.json() as HandleUploadBody;
    const result = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const id = JSON.parse(clientPayload || "{}").id;
        if (typeof id !== "string") throw new Error("Archivo no válido");
        const row = await prisma.patientEvidence.findUnique({ where: { id } });
        if (!row || row.status !== "pending" || !await canAccessEvidence(row)) throw new Error("No autorizado");
        const expected = "testimonials/" + row.id + "/" + row.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        if (pathname !== expected) throw new Error("Ruta no válida");
        return { allowedContentTypes: [row.mimeType], maximumSizeInBytes: Math.min(row.size || MAX_EVIDENCE_BYTES, MAX_EVIDENCE_BYTES),
          addRandomSuffix: false, allowOverwrite: false, tokenPayload: JSON.stringify({ id: row.id, pathname: expected }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}");
        if (blob.pathname !== payload.pathname) throw new Error("Archivo no válido");
        await prisma.patientEvidence.updateMany({ where: { id: payload.id, status: "pending" }, data: { url: blob.url, status: "ready" } });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir" }, { status: 400 });
  }
}
