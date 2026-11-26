import { supportActor, supportBody, supportRoute } from "@/lib/support/http";
import { updateTicketSchema } from "@/lib/support/contracts";
import { readSupportTicket, updateSupportTicket } from "@/lib/support/service";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { id: string } }) { return supportRoute(async () => readSupportTicket(await supportActor(), params.id)); }
export async function PATCH(req: Request, { params }: { params: { id: string } }) { return supportRoute(async () => {
  const actor = await supportActor();
  return updateSupportTicket(actor, params.id, await supportBody(req, updateTicketSchema));
}); }
