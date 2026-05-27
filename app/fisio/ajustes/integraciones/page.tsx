import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { IntegracionesView } from "@/components/IntegracionesView";

export default async function IntegracionesPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!(user.role === "ceo" || user.role === "head_success")) {
    redirect("/fisio");
  }

  // Cargar conexión Google si existe
  const conn = await prisma.googleCalendarConnection.findFirst({
    orderBy: { createdAt: "desc" },
  });

  let connectedBy: { fullName: string } | null = null;
  if (conn?.connectedById) {
    const p = await prisma.professional.findUnique({
      where: { id: conn.connectedById },
      select: { fullName: true },
    });
    if (p) connectedBy = p;
  }

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Integraciones</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Conecta servicios externos para automatizar la app
        </p>
      </header>

      <IntegracionesView
        googleConnection={
          conn
            ? {
                googleEmail: conn.googleEmail,
                googleName: conn.googleName,
                connectedByName: connectedBy?.fullName ?? null,
                createdAt: conn.createdAt.toISOString(),
              }
            : null
        }
        flashSuccess={searchParams.connected === "1"}
        flashError={searchParams.error || null}
      />

      {user.role === "ceo" && (
        <Link
          href="/fisio/ajustes/integraciones/meta"
          className="block rounded-lg p-3 mt-2 hover:bg-neutral-50 bg-white border border-neutral-200"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📷</span>
            <div className="flex-1">
              <div className="font-medium text-sm">Meta · Instagram & Anuncios</div>
              <div className="text-xs text-neutral-500">Seguidores, insights de posts e inversión en ADS</div>
            </div>
            <span className="text-neutral-400">→</span>
          </div>
        </Link>
      )}
    </main>
  );
}
