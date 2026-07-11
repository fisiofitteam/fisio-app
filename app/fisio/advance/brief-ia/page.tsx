import { prisma } from "@/lib/prisma";
import {
  BUILTIN_BRIEF_KINDS,
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
  // Programas rolling activos → cada uno es un kind adicional.
  const rollingPrograms = await prisma.rollingProgram.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  }).catch(() => [] as Array<{ id: string; name: string }>);

  const nameByProgramId = new Map(rollingPrograms.map((p) => [p.id, p.name]));

  // Validamos que el kind pedido es builtin o corresponde a un programa activo.
  // Si viene otra cosa, defaulteamos a "accesorios".
  const requestedKind = searchParams.kind;
  const validKind: BriefKind =
    requestedKind && isBriefKind(requestedKind) &&
    (BUILTIN_BRIEF_KINDS.includes(requestedKind) || nameByProgramId.has(requestedKind))
      ? requestedKind
      : "accesorios";

  const [brief, groups, total, totalsByKind] = await Promise.all([
    getAiTrainingBrief(validKind),
    prisma.aiSessionExample
      .groupBy({
        by: ["summary"],
        where: { kind: validKind },
        _count: { _all: true },
        orderBy: { _count: { id: "desc" } },
      })
      .catch(() => [] as Array<{ summary: string; _count: { _all: number } }>),
    prisma.aiSessionExample.count({ where: { kind: validKind } }).catch(() => 0),
    prisma.aiSessionExample
      .groupBy({ by: ["kind"], _count: { _all: true } })
      .catch(() => [] as Array<{ kind: string; _count: { _all: number } }>),
  ]);

  // Etiqueta legible del kind actual: builtin → BRIEF_KIND_LABEL; programa → su nombre.
  const kindLabel =
    BRIEF_KIND_LABEL[validKind] ?? nameByProgramId.get(validKind) ?? validKind;

  // Todas las pestañas: builtins + programas rolling. Contadores por kind.
  const countsByKind: Record<string, number> = {};
  for (const k of BUILTIN_BRIEF_KINDS) countsByKind[k] = 0;
  for (const p of rollingPrograms) countsByKind[p.id] = 0;
  for (const g of totalsByKind) countsByKind[g.kind] = g._count._all;

  const allKinds = [
    ...BUILTIN_BRIEF_KINDS.map((k) => ({
      kind: k,
      label: BRIEF_KIND_LABEL[k],
      count: countsByKind[k] ?? 0,
    })),
    ...rollingPrograms.map((p) => ({
      kind: p.id,
      label: p.name,
      count: countsByKind[p.id] ?? 0,
    })),
  ];

  return (
    <AiTrainingBriefEditor
      // Forzamos remount al cambiar de kind — así la useState del cliente
      // se reinicializa con el brief correcto y no arrastra los valores del
      // brief anterior en los textareas.
      key={validKind}
      kind={validKind}
      kindLabel={kindLabel}
      allKinds={allKinds}
      brief={brief}
      totalExamples={total}
      exampleSummary={groups.map((g) => ({
        summary: g.summary || "(sin clasificar)",
        count: g._count._all,
      }))}
    />
  );
}
