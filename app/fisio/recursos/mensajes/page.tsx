import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { MessageTemplatesList } from "@/components/MessageTemplatesList";
import { ResourceRoleTabs, resolveActiveRole, type ResourceRole } from "@/components/ResourceRoleTabs";

export default async function MessagesPage({ searchParams }: { searchParams: { rol?: string } }) {
  try {
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
            targetRole: (m.targetRole ?? "ceo") as ResourceRole,
            body: m.body,
          }))}
          isCeo={isCeo}
          defaultRole={role === "all" ? proRole : role}
        />
      </div>
    );
  } catch (err: any) {
    return (
      <div className="p-4">
        <h2 className="font-medium mb-2 text-red-700">Error cargando mensajes</h2>
        <p className="text-sm whitespace-pre-wrap">{err?.message ?? String(err)}</p>
        {err?.code && <p className="text-xs text-neutral-500 mt-1">code: {err.code}</p>}
        {err?.stack && (
          <pre className="text-[10px] bg-neutral-100 p-2 rounded overflow-x-auto mt-2">{err.stack}</pre>
        )}
      </div>
    );
  }
}
