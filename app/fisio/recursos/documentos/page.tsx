import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ResourceRoleTabs } from "@/components/ResourceRoleTabs";
import { resolveActiveRole, visibleRolesForUser, type ResourceRole } from "@/lib/resource-roles";
import { DocumentsView } from "./DocumentsView";

export const dynamic = "force-dynamic";

export default async function DocumentosPage({ searchParams }: { searchParams: { rol?: string } }) {
  const user = (await getActiveProfessional())!;
  const proRole = user.role as ResourceRole;
  const { role } = resolveActiveRole(proRole, searchParams?.rol);
  const allowedRoles = visibleRolesForUser(proRole);

  // Filtro server-side por targetRoles: "all" siempre visible, o
  // el CSV incluye el rol solicitado.
  const target = role === "all" ? proRole : role;
  const docsRaw = await (prisma as any).resourceDocument.findMany({
    orderBy: [{ createdAt: "desc" }],
  });
  const docs = docsRaw.filter((d: any) => {
    const roles = String(d.targetRoles ?? "all").split(",").map((r: string) => r.trim());
    if (roles.includes("all")) return true;
    return roles.includes(target);
  });

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-medium text-lg flex items-center gap-2">
          📄 Documentos
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          Protocolos, papers, plantillas y otros documentos internos del equipo.
        </p>
      </header>
      <ResourceRoleTabs allowedRoles={allowedRoles} currentRole={role} />
      <DocumentsView
        initial={docs.map((d: any) => ({
          id: d.id,
          title: d.title,
          description: d.description,
          url: d.url,
          fileType: d.fileType,
          fileSize: d.fileSize,
          category: d.category,
          targetRoles: d.targetRoles,
          createdAt: d.createdAt.toISOString(),
        }))}
        allowedRoles={allowedRoles}
      />
    </div>
  );
}
