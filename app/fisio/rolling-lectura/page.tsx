import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { RollingReadOnlyList } from "@/components/RollingReadOnlyList";

export const dynamic = "force-dynamic";

/**
 * /fisio/rolling-lectura
 * Vista de solo lectura del rolling para fisios: lista de programas
 * rolling activos. Al entrar en uno ve las 2 semanas próximas sin poder
 * editar (los managers usan /fisio/advance/rolling para editar).
 */
export default async function RollingLecturaPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const allowed = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!allowed) redirect("/fisio");

  const programs = await prisma.rollingProgram.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true, role: true },
  });

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">📆 Rolling ADVANCE (lectura)</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Consulta lo que hacen tus atletas esta semana y la próxima. Si quieres modificar la sesión para un atleta concreto, entra en su ficha.
        </p>
      </header>

      {programs.length === 0 ? (
        <p className="text-sm text-neutral-500 italic py-8 text-center card">
          No hay programas rolling activos.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {programs.map((p) => (
            <Link
              key={p.id}
              href={`/fisio/rolling-lectura/${p.id}`}
              className="rounded-xl border border-neutral-200 bg-white p-3 hover:border-neutral-400"
            >
              <div className="font-medium">{p.name}</div>
              {p.description && <div className="text-xs text-neutral-500 mt-0.5">{p.description}</div>}
              <div className="text-[10px] text-neutral-400 mt-1.5">Ver semana actual + siguiente →</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
