import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { RollingProgramTypesManager } from "@/components/RollingProgramTypesManager";

export const dynamic = "force-dynamic";

// /fisio/advance/rolling/tipos — gestión de tipos personalizados de rolling.
// Ej: "FisioFit Hybrid". Cada tipo puede tener brief IA opcional.
export default async function RollingProgramTypesPage() {
  const user = (await getActiveProfessional())!;
  const canManage = user.role === "ceo" || user.role === "head_success";

  const types = await (prisma as any).rollingProgramType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { programs: true } } },
  }).catch(() => []);

  return (
    <RollingProgramTypesManager
      canManage={canManage}
      initial={types.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        aiBriefPrompt: t.aiBriefPrompt ?? "",
        active: t.active,
        programsCount: t._count?.programs ?? 0,
      }))}
    />
  );
}
