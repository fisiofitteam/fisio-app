import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { ResourceRoleTabs, resolveActiveRole, ROLE_LABELS, type ResourceRole } from "@/components/ResourceRoleTabs";

export default async function FormacionPage({ searchParams }: { searchParams: { rol?: string } }) {
  const pro = await getActiveProfessional();
  if (!pro) redirect("/login");

  const proRole = pro.role as ResourceRole;
  const { role, isCeo } = resolveActiveRole(proRole, searchParams?.rol);

  const visible = role === "all" ? "todos los roles" : ROLE_LABELS[role];

  return (
    <div>
      <ResourceRoleTabs isCeo={isCeo} currentRole={role} />
      <div className="card text-center py-16">
        <div className="text-3xl mb-2">📚</div>
        <h2 className="font-medium mb-1">Formación</h2>
        <p className="text-sm text-neutral-500">
          Próximamente. Aquí guardarás tu propia formación interna y materiales de estudio.
        </p>
        <p className="text-xs text-neutral-400 mt-2">Filtro activo: {visible}</p>
      </div>
    </div>
  );
}
