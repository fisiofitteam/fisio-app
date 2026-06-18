import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ChatView } from "@/components/ChatView";
import { canCreateChannel } from "@/lib/chat";

export const dynamic = "force-dynamic";

/**
 * /fisio/chat?canal=<id>
 *
 * Carga inicial mínima (el componente cliente refresca el resto vía /api/chat).
 * Pasamos la lista de profesionales activos para el selector de DM y para
 * resolver el autocomplete de @menciones.
 */
export default async function ChatPage({ searchParams }: { searchParams: { canal?: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const professionals = await prisma.professional.findMany({
    where: { active: true, id: { not: user.id } },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  return (
    <ChatView
      currentUser={{ id: user.id, fullName: user.fullName, role: user.role }}
      canCreate={canCreateChannel(user.role)}
      teamMembers={professionals}
      initialChannelId={searchParams?.canal ?? null}
    />
  );
}
