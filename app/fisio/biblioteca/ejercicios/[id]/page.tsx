import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExerciseEditor } from "@/components/ExerciseEditor";

export default async function ExerciseEditPage({ params }: { params: { id: string } }) {
  const isNew = params.id === "nuevo";
  let exercise = null;
  if (!isNew) {
    exercise = await prisma.exerciseLibrary.findUnique({ where: { id: params.id } });
    if (!exercise) notFound();
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <header className="mb-6">
        <Link href="/fisio/biblioteca/ejercicios" className="text-xs text-neutral-500">← Biblioteca</Link>
        <h1 className="text-xl font-semibold mt-1">
          {isNew ? "Nuevo ejercicio" : exercise!.name}
        </h1>
      </header>

      <ExerciseEditor
        exercise={
          exercise
            ? {
                id: exercise.id,
                name: exercise.name,
                category: exercise.category,
                tags: exercise.tags,
                youtubeUrl: exercise.youtubeUrl ?? "",
                description: exercise.description ?? "",
              }
            : null
        }
      />
    </main>
  );
}
