import { prisma } from "@/lib/prisma";
import { getAiTrainingBrief } from "@/lib/ai-training-brief";
import { AiTrainingBriefEditor } from "@/components/AiTrainingBriefEditor";

export const dynamic = "force-dynamic";

// Acceso ya restringido a CEO/head_success por app/fisio/advance/layout.tsx.
export default async function BriefIaPage() {
  const [brief, groups, total] = await Promise.all([
    getAiTrainingBrief(),
    prisma.aiSessionExample
      .groupBy({ by: ["summary"], _count: { _all: true }, orderBy: { _count: { id: "desc" } } })
      .catch(() => [] as Array<{ summary: string; _count: { _all: number } }>),
    prisma.aiSessionExample.count().catch(() => 0),
  ]);
  return (
    <AiTrainingBriefEditor
      brief={brief}
      totalExamples={total}
      exampleSummary={groups.map((g) => ({
        summary: g.summary || "(sin clasificar)",
        count: g._count._all,
      }))}
    />
  );
}
