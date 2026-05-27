import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getPeriodRange, type Period } from "@/lib/finance";
import { metaConfigured, getAdsInsights } from "@/lib/meta";
import { AdsPanel } from "@/components/AdsPanel";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function AnunciosPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");

  const period: Period = (["month", "quarter", "year"].includes(searchParams.period ?? "")
    ? (searchParams.period as Period)
    : "month");
  const { start, end, label } = getPeriodRange(period);

  if (!metaConfigured()) {
    return (
      <main>
        <div className="card text-sm text-neutral-600">
          Meta no está conectado. Configura la integración en <strong>Ajustes → Integraciones → Meta</strong> y vuelve aquí.
        </div>
      </main>
    );
  }

  let campaigns = null;
  let error: string | null = null;
  try {
    campaigns = await getAdsInsights({ level: "campaign", since: ymd(start), until: ymd(end) });
  } catch (e: any) {
    error = e.message;
  }

  return (
    <main>
      <AdsPanel
        period={period}
        periodLabel={label}
        campaigns={campaigns ? JSON.parse(JSON.stringify(campaigns)) : []}
        error={error}
      />
    </main>
  );
}
