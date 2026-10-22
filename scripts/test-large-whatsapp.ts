import assert from "node:assert/strict";
import { uploadWhatsApp } from "../lib/upload-whatsapp";
async function main() {
  const text = "\uFEFF" + "22/10/26, 10:00 - Atleta: Estoy mejor 💪\n".repeat(140000);
  let combined = "", offset = 0, size = 0, chunks = 0;
  globalThis.fetch = (async (url: string, options: any) => {
    const b = JSON.parse(options.body);
    if (url === "/api/testimonials") { assert.equal(b.chunked, true); size = b.size; return Response.json({ id: "test" }); }
    assert.equal(b.offset, offset);
    const bytes = Buffer.byteLength(b.chunk);
    assert.ok(bytes <= 512 * 1024);
    assert.ok(!b.chunk.includes("\uFFFD"));
    combined += b.chunk; offset += bytes; chunks++;
    return Response.json({ ok: true });
  }) as any;
  await uploadWhatsApp(new File([text], "chat.txt"), { patientId: "test" }, () => {});
  assert.equal(combined, text);
  assert.equal(offset, size);
  assert.ok(size > 4.5 * 1024 * 1024);
  assert.ok(chunks > 1);
  await assert.rejects(() => uploadWhatsApp(new File([""], "empty.txt"), {}, () => {}));
  await assert.rejects(() => uploadWhatsApp(new File([new Uint8Array([255, 255])], "invalid.txt"), {}, () => {}), /UTF-8/);
  console.log("PASS: large TXT chunking, exact Unicode/BOM preservation, byte offsets and invalid files");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
