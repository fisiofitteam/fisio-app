import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireRecordingProfessional, recordingFailure } from "@/lib/recordings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireRecordingProfessional();
    const bytes = await readFile(join(process.cwd(), "public", "fisiofit-recorder.zip"));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=FisioFit-Recorder.zip", "Cache-Control": "private, no-store" } });
  } catch (error) { return recordingFailure(error); }
}
