import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { MarketerIAView } from "@/components/MarketerIAView";

export const dynamic = "force-dynamic";

export default async function MarketerIAPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/contenido");

  return (
    <main>
      <ContentNav active="marketer" role={user.role} />
      <header className="mb-4">
        <h1 className="text-xl font-semibold">🧠 Marketer IA</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Pídele estrategia de contenido. La IA propone semanas y piezas concretas — con un click las añades al calendario.
        </p>
      </header>

      <MarketerIAView />
    </main>
  );
}
