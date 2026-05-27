import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { MetaIntegration } from "@/components/MetaIntegration";
import { AdsDashboard } from "@/components/AdsDashboard";

export const dynamic = "force-dynamic";

export default async function MetaIntegrationPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio");

  return (
    <main>
      <header className="mb-4">
        <Link href="/fisio/ajustes/integraciones" className="text-xs text-neutral-500">← Integraciones</Link>
        <h1 className="text-xl font-semibold mt-1">Meta (Instagram & Anuncios)</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Seguidores e insights de publicaciones (Instagram) e inversión en anuncios (Marketing API).
        </p>
      </header>

      <MetaIntegration />

      <div className="mt-8">
        <AdsDashboard />
      </div>
    </main>
  );
}
