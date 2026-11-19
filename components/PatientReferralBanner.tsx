"use client";

import { Gift, ArrowUpRight } from "lucide-react";
import { isReferralProgram, REFERRAL_AMOUNT_EUROS } from "@/lib/patient-referrals";

export function PatientReferralBanner({
  patientId,
  programType,
}: {
  patientId: string;
  programType?: string | null;
}) {
  if (!isReferralProgram(programType)) return null;

  return (
    <section
      aria-label="Recomienda FisioFitCross"
      className="mb-5 rounded-2xl p-4 text-left"
      style={{
        background: "var(--p-amber-bg)",
        border: "1px solid var(--p-amber-border)",
        color: "var(--p-text)",
      }}
    >
      <div className="flex items-start gap-3">
        <Gift size={22} className="mt-0.5 shrink-0" style={{ color: "var(--p-amber-text)" }} aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-snug">
            {REFERRAL_AMOUNT_EUROS} € para ti. {REFERRAL_AMOUNT_EUROS} € para tu amigo.
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--p-text-dim)" }}>
            ¿Conoces a alguien que entrena con dolor? Recomiéndale FisioFitCross:
            tendrá {REFERRAL_AMOUNT_EUROS} € de descuento en su primer programa y tú
            recibirás {REFERRAL_AMOUNT_EUROS} € de regalo cuando contrate. El equipo lo gestiona.
          </p>
        </div>
      </div>
      <a
        href={`/api/patient-referrals/share?patientId=${encodeURIComponent(patientId)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
      >
        Recomendar a un amigo <ArrowUpRight size={16} aria-hidden />
      </a>
      <p className="mt-2 text-center text-xs" style={{ color: "var(--p-text-dim)" }}>
        Elige a quién enviárselo por WhatsApp.
      </p>
    </section>
  );
}
