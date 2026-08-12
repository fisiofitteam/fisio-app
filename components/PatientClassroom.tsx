"use client";

import Link from "next/link";
import { CourseCover } from "@/components/CourseCover";
import { PatientNav } from "@/components/PatientNav";
import { ChevronRight } from "lucide-react";

type Course = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  lessonCount: number;
  doneCount: number;
};

const CARD_STYLE = { background: "var(--p-surface)", border: "1px solid var(--p-border)", color: "var(--p-text)" } as const;

/**
 * Pantalla de "Clases" del paciente. Antes vivía como pestaña dentro de
 * la comunidad; ahora tiene su propia ruta `/paciente/[id]/clases` y
 * sustituye visualmente al ítem "Biblioteca" del home.
 */
export function PatientClassroom({
  patientId,
  courses,
  navVariant = "default",
}: {
  patientId: string;
  courses: Course[];
  navVariant?: "default" | "advance" | "prevention";
}) {
  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link href={`/paciente/${patientId}`} className="text-xs" style={{ color: "var(--p-text-faint)" }}>← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>Clases</h1>
          <p className="text-sm mt-1" style={{ color: "var(--p-text-dim)" }}>
            Cursos y lecciones para aprender más sobre tu proceso.
          </p>
        </header>

        {courses.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "var(--p-text-faint)" }}>
            Aún no hay cursos disponibles.
          </p>
        ) : (
          <div className="space-y-4">
            {courses.map((c) => {
              const pct = c.lessonCount > 0 ? Math.round((c.doneCount / c.lessonCount) * 100) : 0;
              return (
                <Link
                  key={c.id}
                  href={`/paciente/${patientId}/clases/curso/${c.id}`}
                  className="block rounded-2xl overflow-hidden"
                  style={CARD_STYLE}
                >
                  <CourseCover title={c.title} coverUrl={c.coverUrl} className="aspect-[16/6]" />
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base flex-1" style={{ letterSpacing: "-0.015em" }}>{c.title}</h3>
                      <ChevronRight size={18} style={{ color: "var(--p-text-faint)" }} />
                    </div>
                    {c.description && (
                      <p className="text-sm mt-1" style={{ color: "var(--p-text-dim)" }}>{c.description}</p>
                    )}
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--p-border-strong)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--p-accent), #F59E0B)" }} />
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--p-text-faint)" }}>
                        {pct}% · {c.doneCount}/{c.lessonCount} lecciones
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <PatientNav patientId={patientId} active="home" variant={navVariant} />
    </main>
  );
}
