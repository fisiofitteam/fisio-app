import { sidebarIdsForRole } from "@/lib/sidebar-order";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getSidebarLayout } from "@/lib/sidebar-settings";
import { SidebarOrderEditor } from "@/components/SidebarOrderEditor";

export default async function SidebarSettingsPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const allowedPages = sidebarIdsForRole(user.role, user.extraRoles ?? []);
  return (
    <main className="max-w-5xl">
      <Link href="/fisio/ajustes" className="text-sm text-neutral-500">
        ← Ajustes
      </Link>
      <h1 className="text-xl font-semibold mt-3">Menú y carpetas</h1>
      <p className="text-sm text-neutral-500 mt-1 mb-5">
        Ordena tus páginas y agrúpalas en carpetas con el nombre e icono que
        prefieras. Se guarda solo para tu cuenta y se aplica en ordenador y
        móvil.
      </p>
      <SidebarOrderEditor
        key={user.id}
        role={user.role}
        allowedPages={allowedPages}
        initialLayout={await getSidebarLayout(user.id, allowedPages)}
      />
    </main>
  );
}
