/**
 * Banner persistente en el home del paciente cuando tiene un formulario
 * asignado por rellenar. NO se oculta hasta que lo rellene, aunque la
 * sesión ya haya pasado de día — el objetivo es que no se le olvide.
 *
 * Si hay varios pendientes, muestra un contador y el CTA lleva al más
 * antiguo (que suele ser el más urgente).
 */
import Link from "next/link";
import type { PendingForm } from "@/lib/pending-forms";

export function PendingFormsBanner({
  patientId,
  pending,
  variant = "light",
}: {
  patientId: string;
  pending: PendingForm[];
  variant?: "light" | "dark";
}) {
  if (!pending || pending.length === 0) return null;

  const first = pending[0];
  const many = pending.length > 1;
  const scheduled = new Date(first.scheduledDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(scheduled);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - day.getTime()) / 86400000);
  const dateHint = diffDays <= 0
    ? "de hoy"
    : diffDays === 1
      ? "de ayer"
      : `de hace ${diffDays} días`;

  const isDark = variant === "dark";
  const bg = isDark ? "#3B2A0A" : "#FEF3C7";
  const border = isDark ? "#78350F" : "#F59E0B";
  const ink = isDark ? "#FDE68A" : "#78350F";
  const subInk = isDark ? "#FCD34D" : "#92400E";
  const btnBg = isDark ? "#FCD34D" : "#78350F";
  const btnInk = isDark ? "#0A0A0A" : "#FFFFFF";

  return (
    <div
      className="rounded-2xl p-4 border-2 shadow-sm"
      style={{ background: bg, borderColor: border }}
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl leading-none">📝</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm" style={{ color: ink }}>
            {many
              ? `Tienes ${pending.length} formularios por rellenar`
              : "Tu fisio te ha dejado un formulario"}
          </div>
          <div className="text-xs mt-0.5 truncate" style={{ color: subInk }}>
            {many
              ? `Empieza por "${first.formTitle}" ${dateHint}`
              : `"${first.formTitle}" ${dateHint}`}
          </div>
          <p className="text-[11px] mt-1.5 leading-snug" style={{ color: subInk }}>
            Rellenarlo le da a tu fisio la info que necesita para ajustar tu
            plan. No te llevará ni 2 minutos y marca la diferencia.
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Link
          href={`/paciente/${patientId}/sesion/${first.sessionId}`}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: btnBg, color: btnInk }}
        >
          Rellenar ahora →
        </Link>
      </div>
    </div>
  );
}
