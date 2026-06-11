import { getActiveProfessional } from "@/lib/session";
import { ResourceRoleTabs } from "@/components/ResourceRoleTabs";
import { resolveActiveRole, ROLE_LABELS, visibleRolesForUser, type ResourceRole } from "@/lib/resource-roles";

export default async function DocumentosPage({ searchParams }: { searchParams: { rol?: string } }) {
  const user = (await getActiveProfessional())!;
  const proRole = user.role as ResourceRole;
  const { role } = resolveActiveRole(proRole, searchParams?.rol);
  const allowedRoles = visibleRolesForUser(proRole);

  const visible = role === "all" ? "todos los roles" : ROLE_LABELS[role];

  return (
    <div>
      <ResourceRoleTabs allowedRoles={allowedRoles} currentRole={role} />
      <div className="card text-center py-16">
        <div className="text-3xl mb-2">📄</div>
        <h2 className="font-medium mb-1">Documentos</h2>
        <p className="text-sm text-neutral-500">
          Próximamente. Aquí guardarás protocolos, papers y plantillas de interés.
        </p>
        <p className="text-xs text-neutral-400 mt-2">Filtro activo: {visible}</p>
      </div>
    </div>
  );
}
