import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { MiAgendaView } from "@/components/MiAgendaView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi agenda de llamadas · FisioFit" };

export default async function MiAgendaPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!(user.role === "fisio" || user.role === "head_success" || user.role === "ceo")) {
    redirect("/fisio/ajustes");
  }

  const [settings, availability, googleConn] = await Promise.all([
    (prisma as any).professionalCallSettings.findUnique({ where: { professionalId: user.id } }),
    (prisma as any).professionalCallAvailability.findMany({
      where: { professionalId: user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.googleCalendarConnection.findFirst({ where: { professionalId: user.id } }),
  ]);

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Mi agenda de llamadas</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Configura tus horarios disponibles para que los pacientes puedan reservar llamadas de optimización o renovación.
        </p>
      </header>

      <MiAgendaView
        googleConnected={!!googleConn}
        initialSettings={{
          optimizationDurationMin: settings?.optimizationDurationMin ?? 45,
          renewalDurationMin: settings?.renewalDurationMin ?? 45,
        }}
        initialAvailability={availability.map((a: any) => ({
          id: a.id,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
        }))}
      />
    </main>
  );
}
