import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LevelEditor } from "@/components/LevelEditor";

export default async function ProfileDetailPage({ params }: { params: { id: string } }) {
  const profile = await prisma.clinicalProfile.findUnique({
    where: { id: params.id },
    include: {
      levels: {
        orderBy: { order: "asc" },
        include: {
          rules: { include: { movement: true } },
          _count: { select: { rules: true, patients: true } },
        },
      },
    },
  });
  if (!profile) notFound();

  const movements = await prisma.movement.findMany({
    include: { category: true },
    orderBy: [{ category: { name: "asc" } }, { displayName: "asc" }],
  });

  const categories = await prisma.movementCategory.findMany({ orderBy: { name: "asc" } });

  return (
    <main>
      <header className="mb-6">
        <Link href="/fisio/biblioteca/perfiles" className="text-xs text-neutral-500">← Perfiles</Link>
        <h1 className="text-xl font-semibold mt-1">{profile.name}</h1>
        <p className="text-sm text-neutral-500">{profile.description}</p>
      </header>

      <LevelEditor
        profileId={profile.id}
        levels={profile.levels.map((l) => ({
          id: l.id,
          name: l.name,
          order: l.order,
          description: l.description ?? "",
          rules: l.rules.map((r) => ({
            movementId: r.movementId,
            state: r.state as "OK" | "CONDITIONAL" | "BLOCKED",
            substitutionText: r.substitutionText ?? "",
            loadConstraint: r.loadConstraint ?? "",
            physioWarning: r.physioWarning ?? "",
          })),
          rulesCount: l._count.rules,
          patientsCount: l._count.patients,
        }))}
        movements={movements.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          categoryId: m.categoryId,
          categoryName: m.category.name,
        }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </main>
  );
}
