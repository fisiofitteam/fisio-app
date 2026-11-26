import { supportActor, supportBody, supportRoute } from "@/lib/support/http";
import { ticketSchema, statusLabels, kindLabels, priorityLabels } from "@/lib/support/contracts";
import { createSupportTicket, listSupportTickets, SupportError } from "@/lib/support/service";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { return supportRoute(async () => {
  const actor = await supportActor(), query = new URL(req.url).searchParams;
  const filters: { status?: string; kind?: string; priority?: string; page?: number } = {};
  for (const [key, choices] of [["status", statusLabels], ["kind", kindLabels], ["priority", priorityLabels]] as const) {
    const value = query.get(key);
    if (value && !Object.hasOwn(choices, value)) throw new SupportError(400, "Filtro no válido.");
    if (value) filters[key] = value;
  }
  const page = Number(query.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new SupportError(400, "Página no válida.");
  return listSupportTickets(actor, { ...filters, page });
}); }
export async function POST(req: Request) { return supportRoute(async () => {
  const actor = await supportActor();
  return createSupportTicket(actor, await supportBody(req, ticketSchema));
}); }
