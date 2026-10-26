import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { normalizeSidebarLayout } from "@/lib/sidebar-layout";
export function getSidebarLayout(professionalId: string, allowedIds: string[]) {
  const key = "sidebar-layout:" + professionalId;
  return unstable_cache(async () => {
    const row = await prisma.professional.findUnique({ where: { id: professionalId }, select: { sidebarLayout: true } });
    let raw: unknown;
    try { raw = JSON.parse(row?.sidebarLayout ?? "null"); } catch {}
    return normalizeSidebarLayout(raw, allowedIds);
  }, [key, JSON.stringify(allowedIds)], { tags: [key], revalidate: 60 })();
}
