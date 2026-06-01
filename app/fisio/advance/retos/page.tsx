import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ChallengeManager } from "@/components/ChallengeManager";

export const dynamic = "force-dynamic";

export default async function RetosPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "head_success") redirect("/fisio");

  // Trae los últimos 12 meses (este + 11 anteriores)
  const now = new Date();
  const challenges = await prisma.monthlyChallenge.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 24,
    include: {
      results: {
        include: { patient: { select: { id: true, fullName: true, photoUrl: true, programType: true } } },
        orderBy: { recordedAt: "asc" },
      },
    },
  });

  return (
    <ChallengeManager
      initial={challenges.map((c) => ({
        id: c.id,
        year: c.year,
        month: c.month,
        title: c.title,
        description: c.description,
        metric: c.metric as "score" | "time",
        results: c.results.map((r) => ({
          id: r.id,
          value: r.value,
          unit: r.unit,
          recordedAt: r.recordedAt.toISOString(),
          notes: r.notes,
          patient: r.patient,
        })),
      }))}
      currentYear={now.getFullYear()}
      currentMonth={now.getMonth()}
    />
  );
}
