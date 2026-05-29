"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  id: string;
  patientId: string;
  value: string;
  unit: string | null;
  notes: string | null;
  recordedAt: string;
  patient: { id: string; fullName: string; photoUrl: string | null };
};
type Challenge = {
  id: string;
  title: string;
  description: string | null;
  metric: "score" | "time";
  results: Result[];
};

function parseTimeToSeconds(s: string): number | null {
  const m = s.trim().match(/^(?:(\d+):)?(\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const mins = m[1] ? parseInt(m[1], 10) : 0;
  const secs = parseInt(m[2], 10);
  const dec = m[3] ? parseFloat("0." + m[3]) : 0;
  return mins * 60 + secs + dec;
}
function parseScore(s: string): number | null {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function sortResults(results: Result[], metric: "score" | "time"): Result[] {
  return [...results].sort((a, b) => {
    const va = metric === "time" ? parseTimeToSeconds(a.value) : parseScore(a.value);
    const vb = metric === "time" ? parseTimeToSeconds(b.value) : parseScore(b.value);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return metric === "time" ? va - vb : vb - va;
  });
}

export function PatientChallengeClient({
  patientId, challenge,
}: {
  patientId: string;
  challenge: Challenge;
}) {
  const router = useRouter();
  const myResult = challenge.results.find((r) => r.patientId === patientId) ?? null;
  const [value, setValue] = useState(myResult?.value ?? "");
  const [unit, setUnit] = useState(myResult?.unit ?? "");
  const [notes, setNotes] = useState(myResult?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!myResult);
  const sorted = sortResults(challenge.results, challenge.metric);
  const myPosition = myResult ? sorted.findIndex((r) => r.id === myResult.id) + 1 : null;

  async function submit() {
    if (!value.trim()) return;
    setSaving(true);
    await fetch("/api/patient/challenge-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.id,
        value: value.trim(),
        unit: unit.trim() || null,
        notes: notes.trim() || null,
      }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Reto destacado */}
      <section className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)", color: "var(--p-accent-ink)" }}>
        <div className="text-[10px] font-bold tracking-wider uppercase mb-1">Reto del mes</div>
        <h2 className="text-lg font-bold leading-tight mb-1" style={{ letterSpacing: "-0.02em" }}>{challenge.title}</h2>
        {challenge.description && <p className="text-sm" style={{ color: "rgba(10,10,10,0.75)" }}>{challenge.description}</p>}
        <p className="text-[11px] mt-2" style={{ color: "rgba(10,10,10,0.65)" }}>
          {challenge.metric === "time" ? "⏱ Menor tiempo gana" : "🏋️ Mayor score gana"}
        </p>
      </section>

      {/* Mi resultado */}
      <section className="rounded-2xl p-4" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
        <h3 className="font-semibold text-sm mb-2">Tu resultado</h3>
        {myResult && !editing ? (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--p-accent)" }}>{myResult.value}</span>
              {myResult.unit && <span className="text-sm" style={{ color: "var(--p-text-dim)" }}>{myResult.unit}</span>}
            </div>
            {myPosition !== null && (
              <div className="text-xs mt-1" style={{ color: "var(--p-text-dim)" }}>
                Posición en el leaderboard: #{myPosition} de {sorted.length}
              </div>
            )}
            {myResult.notes && <p className="text-xs italic mt-2" style={{ color: "var(--p-text-faint)" }}>{myResult.notes}</p>}
            <button onClick={() => setEditing(true)} className="text-xs font-medium mt-3 px-3 py-1.5 rounded-lg" style={{ background: "var(--p-surface-2)", color: "var(--p-text)" }}>
              ✏️ Editar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: "var(--p-card-bg)", color: "var(--p-card-ink)", border: "1px solid var(--p-border)" }}
                placeholder={challenge.metric === "time" ? "3:42" : "127"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <input
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: "var(--p-card-bg)", color: "var(--p-card-ink)", border: "1px solid var(--p-border)" }}
                placeholder={challenge.metric === "time" ? "Unidad (opcional)" : "kg, reps..."}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <input
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: "var(--p-card-bg)", color: "var(--p-card-ink)", border: "1px solid var(--p-border)" }}
              placeholder="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              {myResult && (
                <button onClick={() => { setEditing(false); setValue(myResult.value); setUnit(myResult.unit ?? ""); setNotes(myResult.notes ?? ""); }} className="text-xs px-3 py-2" style={{ color: "var(--p-text-dim)" }}>
                  Cancelar
                </button>
              )}
              <button
                onClick={submit}
                disabled={saving || !value.trim()}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
              >
                {saving ? "Guardando..." : myResult ? "Actualizar" : "Enviar resultado"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Leaderboard */}
      <section className="rounded-2xl p-4" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
        <div className="flex justify-between items-end mb-2">
          <h3 className="font-semibold text-sm">🏆 Leaderboard</h3>
          <span className="text-[11px]" style={{ color: "var(--p-text-faint)" }}>{sorted.length} {sorted.length === 1 ? "participante" : "participantes"}</span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-center py-6 italic" style={{ color: "var(--p-text-faint)" }}>Sé el primero en enviar tu resultado.</p>
        ) : (
          <ol className="space-y-2">
            {sorted.map((r, i) => {
              const isMe = r.patientId === patientId;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2.5 p-2 rounded-lg"
                  style={{
                    background: isMe ? "rgba(252, 211, 77, 0.15)" : "transparent",
                    border: isMe ? "1px solid rgba(252, 211, 77, 0.4)" : "none",
                  }}
                >
                  <span className="font-bold w-7 text-center tabular-nums" style={{ color: i === 0 ? "#FBBF24" : i === 1 ? "var(--p-text-dim)" : i === 2 ? "#FB923C" : "var(--p-text-faint)", fontSize: i < 3 ? 18 : 14 }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  {r.patient.photoUrl ? (
                    <img src={r.patient.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)", color: "var(--p-accent-ink)" }}>
                      {r.patient.fullName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{r.patient.fullName.split(" ")[0]}{isMe && <span className="text-[10px] ml-1" style={{ color: "var(--p-text-faint)" }}>(tú)</span>}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold tabular-nums">{r.value}{r.unit && <span className="text-xs font-normal ml-1" style={{ color: "var(--p-text-dim)" }}>{r.unit}</span>}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
