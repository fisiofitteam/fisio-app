import { supportActor, supportBody, supportRoute } from "@/lib/support/http";
import { chatSchema } from "@/lib/support/contracts";
import { readSupportChat, sendSupportChat } from "@/lib/support/service";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() { return supportRoute(async () => readSupportChat(await supportActor())); }
export async function POST(req: Request) { return supportRoute(async () => {
  const actor = await supportActor();
  return sendSupportChat(actor, await supportBody(req, chatSchema));
}); }
