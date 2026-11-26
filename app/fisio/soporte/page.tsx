import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { managesSupport } from "@/lib/support/guide";
import { SupportInbox } from "@/components/support/SupportInbox";
export const dynamic = "force-dynamic";
export default async function SupportPage({ searchParams }: { searchParams: { ticket?: string } }) {
  const actor = await getActiveProfessional();
  if (!actor) redirect("/login");
  return <SupportInbox manager={managesSupport(actor)} initialTicket={typeof searchParams.ticket === "string" ? searchParams.ticket.slice(0, 100) : undefined} />;
}
