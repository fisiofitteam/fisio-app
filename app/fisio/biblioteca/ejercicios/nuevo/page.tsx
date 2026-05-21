import Link from "next/link";
import { ExerciseEditor } from "@/components/ExerciseEditor";

export default function NewExercisePage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <header className="mb-6">
        <Link href="/fisio/biblioteca/ejercicios" className="text-xs text-neutral-500">← Biblioteca</Link>
        <h1 className="text-xl font-semibold mt-1">Nuevo ejercicio</h1>
      </header>
      <ExerciseEditor exercise={null} />
    </main>
  );
}
