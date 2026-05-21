import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function LibraryFormsPage() {
  const forms = await prisma.formLibrary.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">{forms.length} formularios reutilizables</p>
        <Link href="/fisio/biblioteca/formularios/nuevo" className="btn btn-primary text-xs">
          + Nuevo formulario
        </Link>
      </div>

      {forms.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12">
          No hay formularios todavía. Crea el primero.
        </p>
      ) : (
        <div className="space-y-2">
          {forms.map((f) => {
            const qs = JSON.parse(f.questions) as any[];
            return (
              <Link key={f.id} href={`/fisio/biblioteca/formularios/${f.id}`} className="card flex justify-between hover:border-neutral-300">
                <div className="flex-1">
                  <div className="font-medium">{f.name}</div>
                  {f.description && <div className="text-xs text-neutral-500 mt-0.5">{f.description}</div>}
                  <div className="text-xs text-neutral-400 mt-1">{qs.length} pregunta{qs.length !== 1 && "s"}</div>
                </div>
                <span className="text-neutral-300 self-center">→</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
