import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CommunityView } from "@/components/CommunityView";

export const dynamic = "force-dynamic";

export default async function ComunidadPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const canCommunity = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!canCommunity) redirect("/fisio");

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
      initialIdeas={ideas.map((i) => ({ id: i.id, category: i.category, text: i.text }))}
    />
  );
}
