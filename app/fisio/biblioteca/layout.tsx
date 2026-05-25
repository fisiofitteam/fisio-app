import { LibrarySidebar } from "@/components/LibrarySidebar";
import { getActiveProfessional } from "@/lib/session";

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveProfessional();
  const isCeo = user?.role === "ceo";
  const canCatalog = isCeo || user?.role === "head_success";

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Biblioteca</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Todo el contenido reutilizable</p>
      </header>

      <LibrarySidebar showOnboarding={isCeo} showCatalog={canCatalog} />
      <main className="mt-4 min-w-0">{children}</main>
    </div>
  );
}
