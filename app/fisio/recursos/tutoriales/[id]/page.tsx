import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { TutorialsModuleDetail } from "@/components/TutorialsModuleDetail";
import { canManageTraining, moduleVisibleFor } from "@/lib/training";
import { type ResourceRole } from "@/lib/resource-roles";

export const dynamic = "force-dynamic";

export default async function TutorialModulePage({ params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const userRole = user.role as ResourceRole;
  const canManage = canManageTraining(user.role);

  const moduleRow = await prisma.trainingModule.findUnique({
    where: { id: params.id },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              videoUrl: true,
              attachments: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!moduleRow) notFound();
  if (!moduleVisibleFor(moduleRow.targetRoles, moduleRow.published, userRole, canManage)) notFound();

  return (
    <div>
      <Link href="/fisio/recursos/tutoriales" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Volver a tutoriales
      </Link>
      <header className="mt-2 mb-4">
        <h1 className="text-xl font-semibold">{moduleRow.title}</h1>
        {moduleRow.description && (
          <p className="text-sm text-neutral-600 mt-1">{moduleRow.description}</p>
        )}
      </header>
      <TutorialsModuleDetail
        moduleId={moduleRow.id}
        canManage={canManage}
        sections={moduleRow.sections.map((s) => ({
          id: s.id,
          title: s.title,
          lessons: s.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description ?? "",
            videoUrl: l.videoUrl,
            attachmentsCount: l.attachments.length,
          })),
        }))}
      />
    </div>
  );
}
