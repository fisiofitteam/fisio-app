import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ExercisesByZone } from "@/components/ExercisesByZone";

export default async function LibraryListPage() {
  const exercises = await prisma.exerciseLibrary.findMany({
    orderBy: [{ name: "asc" }],
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">{exercises.length} ejercicios con vídeo</p>
        <Link href="/fisio/biblioteca/ejercicios/nuevo" className="btn btn-primary text-xs">
          + Nuevo ejercicio
        </Link>
      </div>

      <ExercisesByZone
        exercises={exercises.map((ex) => ({
          id: ex.id,
          name: ex.name,
          bodyZone: ex.bodyZone || "otros",
          category: ex.category,
          tags: ex.tags ?? "",
          youtubeUrl: ex.youtubeUrl ?? "",
        }))}
      />
    </div>
  );
}
