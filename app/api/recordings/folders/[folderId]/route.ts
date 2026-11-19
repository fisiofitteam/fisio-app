import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRecordingOrigin, requireRecordingProfessional } from "@/lib/recordings";
import { ownedRecordingFolder, folderName, recordingFolderFailure } from "@/lib/recording-folders";
type Context = { params: { folderId: string } };
export async function PATCH(req: Request, { params }: Context) {
  try {
    checkRecordingOrigin(req); const actor = await requireRecordingProfessional();
    await ownedRecordingFolder(params.folderId, actor.id); const body = await req.json();
    const folder = await prisma.recordingFolder.update({ where: { id: params.folderId, professionalId: actor.id }, data: { name: folderName(body?.name) }, select: { id: true, name: true } });
    return NextResponse.json(folder, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFolderFailure(e); }
}
export async function DELETE(req: Request, { params }: Context) {
  try {
    checkRecordingOrigin(req); const actor = await requireRecordingProfessional();
    await ownedRecordingFolder(params.folderId, actor.id);
    // Cascades only personal folder entries, never the recordings themselves.
    await prisma.recordingFolder.delete({ where: { id: params.folderId, professionalId: actor.id } });
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFolderFailure(e); }
}
