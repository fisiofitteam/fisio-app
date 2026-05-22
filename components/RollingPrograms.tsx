"use client";

import Link from "next/link";
import { useState } from "react";

type Program = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  patientsCount: number;
  weeksCount: number;
};

export function RollingPrograms({ programs, isManager }: { programs: Program[]; isManager: boolean }) {
  const [creating, setCreating] = useState(false);
  const active = programs.filter((p) => p.isActive);
  const archived = programs.filter((p) => !p.isActive);

  return (
    <main>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Programas rolling</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Programas "a tiempo corrido" para ADVANCE. Tú programas la semana fresca cada lunes, todos los pacientes activos la ven.
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setCreating(true)}
            className="text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            + Nuevo programa
          </button>
        )}
      </header>

      {active.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-neutral-500 italic mb-4">
            Aún no has creado ningún programa rolling.
          </p>
          {isManager && (
            <button
              onClick={() => setCreating(true)}
              className="text-sm font-medium px-4 py-2 rounded-lg"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              + Crear primer programa
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((p) => (
            <Link
              key={p.id}
              href={`/fisio/rolling/${p.id}`}
              className="block rounded-xl px-4 py-3 hover:bg-neutral-50 transition"
              style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium" style={{ letterSpacing: "-0.01em" }}>{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-neutral-500 mt-0.5">{p.description}</div>
                  )}
                  <div className="flex gap-3 text-[11px] text-neutral-500 mt-1.5">
                    <span>{p.patientsCount} {p.patientsCount === 1 ? "paciente" : "pacientes"}</span>
                    <span>·</span>
                    <span>{p.weeksCount} {p.weeksCount === 1 ? "semana" : "semanas"} programada{p.weeksCount === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <span className="text-neutral-400">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Archivados</h2>
          <div className="space-y-2">
            {archived.map((p) => (
              <Link
                key={p.id}
                href={`/fisio/rolling/${p.id}`}
                className="block rounded-xl px-4 py-3 hover:bg-neutral-50 transition opacity-60"
                style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}
              >
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">{p.patientsCount} pacientes · {p.weeksCount} semanas</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {creating && <CreateProgramModal onClose={() => setCreating(false)} />}
    </main>
  );
}

function CreateProgramModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/rolling-programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
    });
    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo crear");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">Nuevo programa rolling</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Crea un "canal" de programa con su propio contenido semanal. Luego añades pacientes ADVANCE a este programa.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre *</label>
            <input
              type="text"
              autoFocus
              className="input text-sm w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Rolling Strength, Rolling Performance..."
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
            <textarea
              className="input text-sm w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para quién es, qué enfoque tiene..."
              rows={3}
            />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="w-full"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              fontWeight: 500,
              fontSize: 14,
              border: "none",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Creando..." : "Crear programa"}
          </button>
        </div>
      </div>
    </div>
  );
}
