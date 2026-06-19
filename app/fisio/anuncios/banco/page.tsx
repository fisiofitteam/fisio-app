import { prisma } from "@/lib/prisma";
import { AdsBankView } from "@/components/AdsBankView";

export const dynamic = "force-dynamic";

export default async function BancoPage() {
  const [hooks, audiences] = await Promise.all([
    prisma.adHook.findMany({ orderBy: [{ active: "desc" }, { updatedAt: "desc" }] }),
    prisma.adAudience.findMany({ orderBy: [{ active: "desc" }, { updatedAt: "desc" }] }),
  ]);

  return (
    <AdsBankView
      hooks={hooks.map((h) => ({ id: h.id, text: h.text, notes: h.notes ?? "", active: h.active }))}
      audiences={audiences.map((a) => ({ id: a.id, name: a.name, description: a.description, active: a.active }))}
    />
  );
}
