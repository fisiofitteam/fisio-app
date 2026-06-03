import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { parseCategories } from "@/lib/community";
import { CommunityNav } from "@/components/CommunityNav";
import { CommunityView } from "@/components/CommunityView";

export const dynamic = "force-dynamic";

export default async function PlanContenidoInternoPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const canPlan = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!canPlan) redirect("/fisio");

  // Mes actual (UTC) para la carga inicial
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  const monthStart = new Date(Date.UTC(year, month, 1));
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));

  const [posts, ideas, team] = await Promise.all([
    prisma.communityPost.findMany({ where: { date: { gte: monthStart, lt: nextMonth } }, orderBy: { date: "asc" } }),
    prisma.communityIdea.findMany({ where: { used: false }, orderBy: { createdAt: "desc" } }),
    prisma.professional.findMany({
      where: { active: true, role: { in: ["ceo", "head_success", "fisio"] } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <main>
      <CommunityNav active="plan" />
      <CommunityView
        initialYear={year}
        initialMonth={month}
        team={team}
        initialPosts={posts.map((p) => ({
          id: p.id,
          date: p.date.toISOString(),
          category: p.category,
          assignedToId: p.assignedToId,
          text: p.text,
          done: p.done,
        }))}
        initialIdeas={ideas.map((i) => ({ id: i.id, categories: parseCategories(i.categories), text: i.text }))}
      />
    </main>
  );
}
