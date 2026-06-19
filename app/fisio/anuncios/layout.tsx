import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { AdsSubnav } from "@/components/AdsSubnav";

export default async function AnunciosLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio");

  return (
    <div>
      <header className="mb-3">
        <h1 className="text-xl font-semibold">📣 Anuncios</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Campañas, producción y métricas de pago. Atribución por UTMs.
        </p>
      </header>
      <AdsSubnav />
      <main className="mt-4">{children}</main>
    </div>
  );
}
