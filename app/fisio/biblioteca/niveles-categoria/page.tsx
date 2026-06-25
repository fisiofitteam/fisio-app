import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CategoryLevelsEditor } from "@/components/CategoryLevelsEditor";

export const dynamic = "force-dynamic";

export default async function NivelesCategoriaPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!user.isManager) redirect("/fisio/biblioteca/programas");

  const categories = await prisma.movementCategory.findMany({
    include: {
      movements: { orderBy: { displayName: "asc" }, select: { id: true, displayName: true } },
      levels: {
        orderBy: { order: "asc" },
        include: { rules: { select: { movementId: true, state: true, loadConstraint: true, substitutionText: true, physioWarning: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="space-y-3">
      <header>
        <h2 className="text-base font-semibold">🪜 Niveles por categoría</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Para cada categoría del catálogo, define los niveles disponibles. Por cada nivel,
          marca qué reglas se aplican a los movimientos de esa categoría (OK / CONDICIONAL / BLOQUEADO + carga + sustitución + warning). La IA elegirá un nivel por categoría cuando le pidas un control de cargas.
        </p>
      </header>
      <CategoryLevelsEditor
        initial={categories.map((c) => ({
          id: c.id,
          name: c.name,
          movements: c.movements,
          levels: c.levels.map((l) => ({
            id: l.id,
            name: l.name,
            order: l.order,
            description: l.description,
            rules: l.rules.map((r) => ({ ...r, state: r.state as "OK" | "CONDITIONAL" | "BLOCKED" })),
          })),
        }))}
      />
    </main>
  );
}
