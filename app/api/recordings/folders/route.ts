import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRecordingOrigin, requireRecordingProfessional } from "@/lib/recordings";
import { getRecordingFolders, folderName, recordingFolderFailure } from "@/lib/recording-folders";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const actor = await requireRecordingProfessional(); return NextResponse.json(await getRecordingFolders(actor.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (e) { return recordingFolderFailure(e); }
}
export async function POST(req: Request) {
  try {
    checkRecordingOrigin(req); const actor = await requireRecordingProfessional();
    const body = await req.json(), name = folderName(body?.name);
    return NextResponse.json(await prisma.recordingFolder.create({ data: { professionalId: actor.id, name }, select: { id: true, name: true } }), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFolderFailure(e); }
}
