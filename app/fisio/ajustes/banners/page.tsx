import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { BannersAdminView } from "@/components/BannersAdminView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos a pacientes · FisioFit" };

export default async function BannersAdminPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "head_success") redirect("/fisio/ajustes");

  const banners = await (prisma as any).patientBanner.findMany({
    orderBy: [{ startsAt: "desc" }],
    include: {
      createdBy: { select: { fullName: true } },
      _count: { select: { dismissals: true } },
    },
  });

  return (
    <main className="max-w-3xl mx-auto p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">📢 Avisos a pacientes</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Banners programables que aparecen en el home de los pacientes según su programa.
        </p>
      </header>
      <BannersAdminView
        initialBanners={banners.map((b: any) => ({
          id: b.id,
          title: b.title,
          body: b.body,
          variant: b.variant,
          targetProgramTypes: (() => { try { return JSON.parse(b.targetProgramTypes) || []; } catch { return []; } })(),
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
          dismissible: b.dismissible,
          dismissedCount: b._count?.dismissals ?? 0,
          createdByName: b.createdBy?.fullName ?? null,
          createdAt: b.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
