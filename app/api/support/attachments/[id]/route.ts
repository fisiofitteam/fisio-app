import { z } from "zod";
import { supportActor, supportBody, supportRoute } from "@/lib/support/http";
import { discardSupportFile, finishSupportFile } from "@/lib/support/materials";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return supportRoute(async () => { const actor = await supportActor(); await supportBody(req, z.object({}).strict()); return finishSupportFile(actor, params.id); });
}
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return supportRoute(async () => { const actor = await supportActor(); await supportBody(req, z.object({}).strict()); await discardSupportFile(actor, params.id); return { removed: true }; });
}
