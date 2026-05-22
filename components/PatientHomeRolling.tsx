"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function formatWeekLabel(iso: string): string {
  const d = new Date(iso);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const startStr = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  return `${startStr} – ${endStr}`;
}

function extractMarkdown(contentJson: string | null | undefined): string {
  if (!contentJson) return "";
  try {
    const parsed = JSON.parse(contentJson);
    return parsed.markdown || "";
  } catch {
    return contentJson || "";
  }
}

export function PatientHomeRolling({
  firstName,
  mode,
  weekStartIso,
  title,
  contentJson,
  daysToExpire,
}: {
  firstName: string;
  patientId: string;
  mode: "ready" | "pending" | "expired";
  weekStartIso: string;
  title?: string | null;
  contentJson?: string | null;
  daysToExpire?: number | null;
}) {
  const initial = firstName[0]?.toUpperCase() ?? "?";
  const content = extractMarkdown(contentJson);

  if (mode === "expired") {
    return (
      <main className="min-h-screen flex items-center justify-center px-5" style={{ color: "#FAFAFA" }}>
        <div className="max-w-md w-full text-center py-10">
          <Link href="/" className="inline-flex items-center gap-1 text-xs mb-8" style={{ color: "#737373" }}>
            <ArrowLeft size={12} /> Cambiar usuario
          </Link>
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.03em" }}>
            Tu programa ha caducado
          </h1>
          <p className="text-sm" style={{ color: "#A3A3A3" }}>
            Habla con tu coach para renovar y volver a tener acceso al contenido semanal.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ color: "#FAFAFA" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        {/* Header */}
        <header className="mb-7">
          <div className="flex justify-between items-center mb-5">
            <Link href="/" className="inline-flex items-center gap-1 text-xs" style={{ color: "#737373" }}>
              <ArrowLeft size={12} /> Cambiar usuario
            </Link>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "#A3A3A3" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#22C55E" }} />
              Sesión activa
            </div>
          </div>

          {/* Avatar + saludo */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex items-center justify-center font-bold flex-shrink-0"
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
                color: "#0A0A0A",
                fontSize: 22,
                letterSpacing: "-0.03em",
              }}
            >
              {initial}
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ letterSpacing: "-0.03em" }}>
                Hola, {firstName}
              </div>
              <div className="text-xs" style={{ color: "#737373" }}>
                Esta es tu semana
              </div>
            </div>
          </div>

          {/* Aviso de caducidad si <=14 días */}
          {daysToExpire !== null && daysToExpire !== undefined && daysToExpire <= 14 && daysToExpire >= 0 && (
            <div
              className="rounded-xl px-4 py-3 mb-3 text-sm"
              style={{
                background: daysToExpire <= 7 ? "rgba(239, 68, 68, 0.10)" : "rgba(251, 191, 36, 0.10)",
                border: `1px solid ${daysToExpire <= 7 ? "rgba(239, 68, 68, 0.30)" : "rgba(251, 191, 36, 0.30)"}`,
                color: daysToExpire <= 7 ? "#FCA5A5" : "#FBBF24",
              }}
            >
              <div className="font-medium">⏰ Tu programa caduca en {daysToExpire} {daysToExpire === 1 ? "día" : "días"}</div>
              <div className="text-xs mt-0.5" style={{ color: "#A3A3A3" }}>
                Habla con tu coach para renovar.
              </div>
            </div>
          )}
        </header>

        {/* Semana actual */}
        <section
          className="rounded-2xl p-5 mb-6"
          style={{ background: "#171717", border: "1px solid #262626" }}
        >
          <div className="text-[11px] font-medium mb-1 tracking-wider" style={{ color: "#737373" }}>
            SEMANA · {formatWeekLabel(weekStartIso).toUpperCase()}
          </div>
          {title && (
            <h2 className="text-xl font-bold mb-3" style={{ letterSpacing: "-0.025em" }}>
              {title}
            </h2>
          )}

          {mode === "pending" && (
            <div className="py-6 text-center">
              <div className="text-3xl mb-2">⚒️</div>
              <p className="text-sm" style={{ color: "#A3A3A3" }}>
                Tu coach está preparando la semana.
              </p>
              <p className="text-xs mt-1" style={{ color: "#737373" }}>
                Vuelve pronto.
              </p>
            </div>
          )}

          {mode === "ready" && content && (
            <div
              className="text-sm whitespace-pre-wrap leading-relaxed"
              style={{ color: "#E5E5E5" }}
            >
              {content}
            </div>
          )}

          {mode === "ready" && !content && (
            <p className="text-sm italic" style={{ color: "#737373" }}>
              Tu coach ha programado esta semana pero aún no ha añadido el contenido.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
