import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { WeeklyReportsFeed } from "@/components/WeeklyReportsFeed";
import { WeeklyReportsRegenButton } from "@/components/WeeklyReportsRegenButton";

export const dynamic = "force-dynamic";

export default async function ResumenesPage({ searchParams }: { searchParams: { week?: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "fisio" && user.role !== "head_success" && user.role !== "ceo") {
    redirect("/fisio");
  }
  const isManager = user.role === "ceo" || user.role === "head_success";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <header>
        <Link href="/fisio" className="text-xs text-neutral-500">← Panel</Link>
        <h1 className="text-2xl font-semibold mt-1" style={{ letterSpacing: "-0.02em" }}>
          🌅 Resúmenes semanales
        </h1>
        <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
          Cada domingo por la noche, la IA analiza las sesiones y sensaciones de
          la semana de cada paciente RECUPERA/CONSOLIDA con ≥2 sesiones completadas.
          Marca como visto los que ya hayas revisado.
        </p>
      </header>
      {isManager && <WeeklyReportsRegenButton />}
      <WeeklyReportsFeed managerDefault={isManager} initialWeekIso={searchParams.week} />
    </div>
  );
}
