import type { Metadata } from "next";
import { ArrowRight, Check, Gift } from "lucide-react";
import { Logo } from "@/components/Logo";
import { REFERRAL_AMOUNT_EUROS } from "@/lib/patient-referrals";
import { getPublicReferral } from "@/lib/patient-referrals-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrena con confianza · FisioFitCross",
  description: "Readaptación para quienes practican crosstraining. Con una recomendación válida, tienes 50 € de descuento en tu primer programa.",
  openGraph: {
    title: "Tu recomendación tiene regalo · FisioFitCross",
    description: "Conoce nuestro acompañamiento para volver a disfrutar del crosstraining. 50 € de descuento en tu primer programa con una recomendación válida.",
    type: "website",
  },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const benefits = [
  { title: "Un plan para tu caso", text: "Valoramos tus molestias, tus objetivos y cómo entrenas para decidir por dónde empezar." },
  { title: "Tu entrenamiento cuenta", text: "Adaptamos el trabajo a las exigencias del crosstraining y a tu punto de partida." },
  { title: "Acompañamiento de tu fisio", text: "Seguimiento para resolver dudas y ajustar el plan a medida que avanzas." },
];

export default async function ReferralPage({ params }: { params: { code: string } }) {
  const referral = await getPublicReferral(params.code);
  const agendaUrl = referral.valid ? `/agenda?ref=${encodeURIComponent(params.code)}` : "/agenda";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: "linear-gradient(180deg, rgba(10,10,10,.72), #0A0A0A), url('/box.jpg')" }}
        />
        <div className="mx-auto max-w-5xl px-5 pb-12 pt-6 sm:px-8 sm:pb-16">
          <header className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <Logo size={30} /> FisioFitCross
          </header>

          {referral.valid ? (
            <section className="max-w-3xl pt-12 sm:pt-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
                <Gift size={15} aria-hidden /> Vienes recomendado
              </div>
              <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
                Que el dolor no decida <span className="text-amber-300">cómo entrenas.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
                Recupera confianza en tus movimientos con un plan adaptado a ti y el
                acompañamiento de un fisio que entiende el crosstraining.
              </p>
              <div className="mt-7 rounded-2xl border border-amber-300/30 bg-neutral-950/70 p-5 sm:max-w-xl">
                <p className="text-2xl font-bold tracking-tight text-amber-300">
                  {REFERRAL_AMOUNT_EUROS} € de descuento para empezar
                </p>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                  En tu primer programa de Recupera, Consolida o Advance como nuevo cliente. Cuando contrates, quien te ha
                  recomendado también recibirá {REFERRAL_AMOUNT_EUROS} € de regalo.
                </p>
                <a
                  href={agendaUrl}
                  className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-center text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
                >
                  Reservar mi valoración gratuita <ArrowRight size={18} className="shrink-0" aria-hidden />
                </a>
                <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                  El equipo aplicará el descuento al contratar y gestionará el regalo de tu amigo.
                </p>
              </div>
            </section>
          ) : (
            <section className="max-w-xl py-16 sm:py-24">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Este enlace no está disponible</h1>
              <p className="mt-4 leading-relaxed text-neutral-300">
                Aun así, podemos ayudarte a entender qué está limitando tu entrenamiento.
                Reserva una valoración con nuestro equipo para conocer cómo trabajamos.
              </p>
              <a
                href={agendaUrl}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
              >
                Reservar una valoración gratuita <ArrowRight size={18} aria-hidden />
              </a>
            </section>
          )}
        </div>
      </div>

      {referral.valid && (
        <div className="mx-auto max-w-5xl px-5 pb-12 sm:px-8 sm:pb-16">
          <section aria-labelledby="service-heading">
            <h2 id="service-heading" className="text-2xl font-semibold tracking-tight">Un proceso adaptado a tu forma de entrenar</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {benefits.map((benefit) => (
                <article key={benefit.title} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
                  <Check size={22} className="mb-4 text-amber-300" aria-hidden />
                  <h3 className="font-semibold">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{benefit.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="steps-heading" className="mt-12 rounded-2xl bg-neutral-50 p-5 text-neutral-950 sm:p-8">
            <h2 id="steps-heading" className="text-2xl font-semibold tracking-tight">Así de sencillo</h2>
            <ol className="mt-6 space-y-6">
              {[
                ["Reserva tu valoración", "Elige cuándo hablamos y cuéntanos qué te impide entrenar como te gustaría."],
                ["Conoce tu próximo paso", "El equipo escucha tu caso y te explica qué programa puede encajar contigo."],
                ["Empieza con tu descuento", `Si contratas tu primer programa, aplicamos tus ${REFERRAL_AMOUNT_EUROS} € de descuento y gestionamos los ${REFERRAL_AMOUNT_EUROS} € de regalo para quien te recomendó.`],
              ].map(([title, text], index) => (
                <li key={title} className="flex gap-3 sm:gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-300 text-sm font-bold" aria-hidden>{index + 1}</span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-600">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <a
              href={agendaUrl}
              className="mt-7 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              Reservar mi valoración gratuita <ArrowRight size={18} className="shrink-0" aria-hidden />
            </a>
          </section>
        </div>
      )}

      <footer className="border-t border-neutral-800 px-5 py-7 text-center text-xs leading-relaxed text-neutral-400">
        <p>FisioFitCross · Readaptación deportiva online</p>
        <a href="/privacidad" className="mt-2 inline-block rounded py-1 underline underline-offset-4 hover:text-white">Privacidad</a>
      </footer>
    </main>
  );
}
