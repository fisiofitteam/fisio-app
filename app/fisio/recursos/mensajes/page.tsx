import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { MessageTemplatesList } from "@/components/MessageTemplatesList";
import { ResourceRoleTabs, resolveActiveRole, type ResourceRole } from "@/components/ResourceRoleTabs";

export default async function MessagesPage({ searchParams }: { searchParams: { rol?: string } }) {
  // Middleware ya garantiza que hay profesional logueado en /fisio/*
  const user = (await getActiveProfessional())!;
  const proRole = user.role as ResourceRole;
  const { role, isCeo } = resolveActiveRole(proRole, searchParams?.rol);

  const messages = await prisma.messageTemplate.findMany({
    where: role === "all" ? {} : { targetRole: role },
    orderBy: [{ targetRole: "asc" }, { category: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <ResourceRoleTabs isCeo={isCeo} currentRole={role} />
      <MessageTemplatesList
        messages={messages.map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category,
          targetRole: m.targetRole as ResourceRole,
          body: m.body,
        }))}
        isCeo={isCeo}
        defaultRole={role === "all" ? proRole : role}
      />
    </div>
  );
}
