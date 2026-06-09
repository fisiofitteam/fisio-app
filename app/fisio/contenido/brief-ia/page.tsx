import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getAiBrief } from "@/lib/ai-brief";
import { ContentNav } from "@/components/ContentNav";
import { AiBriefEditor } from "@/components/AiBriefEditor";

export const dynamic = "force-dynamic";

export default async function BriefIAPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/contenido");

  const brief = await getAiBrief();

  return (
    <main>
      <ContentNav active="brief-ia" role={user.role} />
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Brief IA</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          El contexto estable que recibe Claude cada vez que generas un guion desde una pieza.
          Cuanto más afinado esté, más se parecerán los guiones a los tuyos.
        </p>
      </header>

      <AiBriefEditor initial={brief} />
    </main>
  );
}
