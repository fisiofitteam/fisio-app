import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { mergeCaseAttachments } from "../lib/case-attachments";
const original = (Module as any)._load;
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request.endsWith("/lib/session") || request.endsWith("/lib/session.ts")) return { getActiveProfessional: async () => ({ id: "test" }) };
  return original.call(this, request, ...args);
};
let row: any = { id: "case-test" };
(globalThis as any).prisma = { clinicalCase: {
  update: async ({data}: any) => row = { ...row, ...data },
  findUnique: async () => row,
}};
async function main() {
  const api = await import("../app/api/content/cases/[id]/route");
  const image = { url: "https://example.test/capture.png", caption: "Comentario", kind: "image" };
  const video = { url: "https://example.test/test.mp4", caption: "Vídeo", kind: "video" };
  const doc = { url: "https://example.test/file.pdf", caption: "PDF", kind: "document" };
  const merged = mergeCaseAttachments([image], [image, video, video, doc]);
  assert.deepEqual(merged, [image, video, doc]);
  const body = { initialSituationVideos: [image], processVideos: [video], obstaclesVideos: [doc], achievementsVideos: merged };
  const params = { params: { id: row.id } };
  const res = await api.PATCH(new NextRequest("https://example.test/api/content/cases/case-test", { method: "PATCH", body: JSON.stringify(body) }), params);
  assert.equal(res.status, 200);
  const detail = await (await api.GET(new NextRequest("https://example.test"), params)).json();
  for (const key of Object.keys(body)) assert.deepEqual(detail[key], body[key as keyof typeof body]);
  console.log("PASS: attachment deduplication, independent sections and image/video/PDF save-reload");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
