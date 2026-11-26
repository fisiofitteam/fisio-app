import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { supportActor, supportBody, supportRoute } from "@/lib/support/http";
import { requireOwnedSupportUpload, supportStorageToken } from "@/lib/support/materials";
import { SupportError } from "@/lib/support/errors";
export const runtime = "nodejs";
// Completion is confirmed by an authenticated POST + Blob head. No public callback
// or middleware exception is needed for these private uploads.
export async function POST(req: Request) {
  return supportRoute(async () => {
    const actor = await supportActor();
    const body = await supportBody(req, z.object({ type: z.literal("blob.generate-client-token"), payload: z.unknown() }).strict());
    return handleUpload({ body: body as HandleUploadBody, request: req, token: supportStorageToken(),
      onBeforeGenerateToken: async (pathname, payload) => {
        const parsed = z.object({ id: z.string().uuid() }).strict().safeParse(JSON.parse(payload || "{}"));
        if (!parsed.success) throw new SupportError(400, "Falta la referencia de la subida.");
        const row = await requireOwnedSupportUpload(actor, parsed.data.id);
        if (row.blobPath !== pathname || row.status !== "pending") throw new SupportError(409, "Subida no disponible.");
        return { allowedContentTypes: [row.mime], maximumSizeInBytes: row.size, addRandomSuffix: false, allowOverwrite: false, validUntil: row.pendingUntil!.getTime() };
      },
    });
  });
}
