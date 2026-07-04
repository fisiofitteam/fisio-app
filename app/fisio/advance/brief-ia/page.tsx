import { prisma } from "@/lib/prisma";
import {
  BRIEF_KINDS,
  BRIEF_KIND_LABEL,
  getAiTrainingBrief,
  isBriefKind,
  type BriefKind,
} from "@/lib/ai-training-brief";
import { AiTrainingBriefEditor } from "@/components/AiTrainingBriefEditor";

export const dynamic = "force-dynamic";

// Acceso ya restringido a CEO/head_success por app/fisio/advance/layout.tsx.
export default async function BriefIaPage({
  searchParams,
}: {
  searchParams: { kind?: string };
}) {
  const kind: BriefKind = isBriefKind(searchParams.kind) ? searchParams.kind : "accesorios";

  const [brief, groups, total, totalsByKind] = await Promise.all([
    getAiTrainingBrief(kind),
    prisma.aiSessionExample
      .groupBy({
        by: ["summary"],
        where: { kind },
        _count: { _all: true },
        orderBy: { _count: { id: "desc" } },
      })
      .catch(() => [] as Array<{ summary: string; _count: { _all: number } }>),
    prisma.aiSessionExample.count({ where: { kind } }).catch(() => 0),
    prisma.aiSessionExample
      .groupBy({ by: ["kind"], _count: { _all: true } })
      .catch(() => [] as Array<{ kind: string; _count: { _all: number } }>),
  ]);

  const countsByKind: Record<string, number> = {};
  for (const k of BRIEF_KINDS) countsByKind[k] = 0;
  for (const g of totalsByKind) countsByKind[g.kind] = g._count._all;

  return (
    <AiTrainingBriefEditor
      kind={kind}
      kindLabel={BRIEF_KIND_LABEL[kind]}
      allKinds={BRIEF_KINDS.map((k) => ({
        kind: k,
        label: BRIEF_KIND_LABEL[k],
        count: countsByKind[k] ?? 0,
      }))}
      brief={brief}
      totalExamples={total}
      exampleSummary={groups.map((g) => ({
        summary: g.summary || "(sin clasificar)",
        count: g._count._all,
      }))}
    />
  );
}
