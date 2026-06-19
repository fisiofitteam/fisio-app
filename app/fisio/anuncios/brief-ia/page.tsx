import { prisma } from "@/lib/prisma";
import { AdsBriefIaView } from "@/components/AdsBriefIaView";

export const dynamic = "force-dynamic";

export default async function BriefIaPage() {
  const [hooks, audiences] = await Promise.all([
    prisma.adHook.findMany({ where: { active: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.adAudience.findMany({ where: { active: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  return (
    <AdsBriefIaView
      hooks={hooks.map((h) => ({ id: h.id, text: h.text }))}
      audiences={audiences.map((a) => ({ id: a.id, name: a.name, description: a.description }))}
    />
  );
}
