import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { FisioAiPanel } from "@/components/FisioAiPanel";

export const dynamic = "force-dynamic";

export default async function FisioIaPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  // Beta cerrada mientras el CEO afina el brief. Cuando esté maduro,
  // ampliamos a head_success y fisios.
  if (user.role !== "ceo") redirect("/fisio");

  // Cargamos el brief (si no existe, endpoint lo crea vacío al hacer PUT).
  const brief = await (prisma as any).fisioAiBrief.findFirst({ orderBy: { createdAt: "asc" } });
  const initialBrief: string = brief?.content ?? "";

  return (
    <main className="p-4">
      <header className="max-w-3xl mx-auto mb-4">
        <div className="text-[10px] uppercase tracking-widest font-bold text-amber-600 mb-1">
          BETA · Solo CEO
        </div>
        <h1 className="text-2xl font-bold">🧠 Fisio IA</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Asistente para preparar llamadas de optimización / renovación y ayudar con casos difíciles.
          Ajusta el brief para afinar cómo responde y pruébalo debajo. Cuando esté listo lo abrimos al resto del equipo.
        </p>
      </header>
      <FisioAiPanel initialBrief={initialBrief} />
    </main>
  );
}
