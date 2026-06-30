import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CatalogEditor } from "@/components/CatalogEditor";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "head_success") redirect("/fisio/biblioteca");

  const [categories, movements] = await Promise.all([
    // order es el campo editable con ↑/↓; usamos name como desempate para
    // bloques antiguos que todavía comparten order=0.
    prisma.movementCategory.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
    prisma.movement.findMany({ orderBy: { displayName: "asc" } }),
  ]);

  return (
    <CatalogEditor
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      movements={movements.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        categoryId: m.categoryId,
        aliases: m.aliases,
        isOverhead: m.isOverhead,
        isImpact: m.isImpact,
        isKipping: m.isKipping,
      }))}
    />
  );
}
