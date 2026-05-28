import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { WorkoutsLibrary } from "@/components/WorkoutsLibrary";

export const dynamic = "force-dynamic";

export default async function WorkoutsLibraryPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const templates = await prisma.workoutTemplate.findMany({
    orderBy: { updatedAt: "desc" },
  });
  const exercises = await prisma.exerciseLibrary.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <WorkoutsLibrary
      initial={templates.map((t) => ({
        id: t.id,
        title: t.title,
        bodyText: t.bodyText,
        exerciseIds: safeParse(t.exerciseIds),
        updatedAt: t.updatedAt.toISOString(),
      }))}
      exercises={exercises.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        tags: e.tags,
        youtubeUrl: e.youtubeUrl,
      }))}
    />
  );
}

function safeParse(s: string): string[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
