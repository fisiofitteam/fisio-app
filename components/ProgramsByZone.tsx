"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Program = {
  id: string;
  name: string;
  bodyZone: string;
  type: string;
  level: number;
  description: string;
  weeksCount: number;
  totalTasks: number;
  assignmentsCount: number;
};

const ZONES = [
  { key: "hombro", label: "Hombro", icon: "💪" },
  { key: "lumbar", label: "Lumbar", icon: "🦴" },
  { key: "rodilla", label: "Rodilla", icon: "🦵" },
  { key: "otros", label: "Otros", icon: "✨" },
];

export function ProgramsByZone({ programs }: { programs: Program[] }) {
  const [openZone, setOpenZone] = useState<string | null>("hombro");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [actionsFor, setActionsFor] = useState<Program | null>(null);

  const allTypes = useMemo(() => {
    const set = new Set(programs.map((p) => p.type));
    return Array.from(set).sort();
  }, [programs]);

  const filtered = useMemo(() => {
    return programs.filter((p) => {
      if (typeFilter && p.type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !p.name.toLowerCase().includes(s) &&
          !p.description.toLowerCase().includes(s) &&
          !p.type.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [programs, search, typeFilter]);

  const byZone: Record<string, Program[]> = {};
  for (const p of filtered) {
    const zone = ZONES.find((z) => z.key === p.bodyZone)?.key ?? "otros";
    if (!byZone[zone]) byZone[zone] = [];
    byZone[zone].push(p);
  }

  const isSearching = search.trim().length > 0 || typeFilter !== "";

  return (
    <>
      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <input
              className="input pl-8 text-sm"
              placeholder="🔍 Buscar por nombre, descripción o tipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <select
          className="input text-sm w-auto"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {allTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {ZONES.map((zone) => {
          const list = byZone[zone.key] ?? [];
          const open = isSearching ? list.length > 0 : openZone === zone.key;

          if (isSearching && list.length === 0) return null;

          return (
            <section key={zone.key} className="border border-neutral-200 rounded-xl bg-white overflow-hidden">
              <button
                onClick={() => !isSearching && setOpenZone(open ? null : zone.key)}
                className="w-full flex items-center justify-between p-4 hover:bg-neutral-50"
                disabled={isSearching}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{zone.icon}</span>
                  <span className="font-medium">{zone.label}</span>
                  <span className="text-xs text-neutral-500">({list.length})</span>
                </div>
                {!isSearching && <span className="text-neutral-400 text-sm">{open ? "▴" : "▾"}</span>}
              </button>
              {open && (
                <div className="border-t border-neutral-100 p-3 space-y-2">
                  {list.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-4 italic">
                      Sin programas en esta zona.
                    </p>
                  ) : (
                    list.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setActionsFor(p)}
                        className="w-full text-left flex justify-between items-start p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{p.name}</span>
                            <span className="text-xs px-2 py-0.5 bg-white rounded-full text-neutral-600 border border-neutral-200">
                              {p.type}
                            </span>
                            <span className="text-xs text-neutral-400">N{p.level}</span>
                          </div>
                          {p.description && (
                            <div className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{p.description}</div>
                          )}
                          <div className="text-xs text-neutral-400 mt-1">
                            {p.weeksCount} sem · {p.totalTasks} tareas · {p.assignmentsCount} pacientes
                          </div>
                        </div>
                        <span className="text-neutral-300 ml-2 self-center">⋯</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </section>
          );
        })}

        {isSearching && filtered.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8 italic">
            No hay programas que coincidan.
          </p>
        )}
      </div>

      {actionsFor && (
        <ProgramActionsModal program={actionsFor} onClose={() => setActionsFor(null)} />
      )}
    </>
  );
}

function ProgramActionsModal({ program, onClose }: { program: Program; onClose: () => void }) {
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function duplicate() {
    setDuplicating(true);
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: program.id,
        name: `${program.name} (copia)`,
        bodyZone: program.bodyZone,
        type: program.type,
        level: program.level,
        weeksCount: program.weeksCount,
        description: program.description,
      }),
    });
    const data = await res.json();
    onClose();
    router.push(`/fisio/biblioteca/programas/${data.id}`);
    router.refresh();
  }

  async function remove() {
    const warning = program.assignmentsCount > 0
      ? `Este programa está asignado a ${program.assignmentsCount} paciente${program.assignmentsCount !== 1 ? "s" : ""}. Se desasignará a esos pacientes y la plantilla se perderá. Las sesiones ya completadas conservan su snapshot pero las sesiones futuras de ese programa desaparecerán.\n\n¿Eliminar "${program.name}"?`
      : `¿Eliminar "${program.name}"? Esta acción no se puede deshacer.`;
    if (!confirm(warning)) return;
    setDeleting(true);
    const res = await fetch(`/api/programs?id=${program.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`No se ha podido eliminar el programa.\n\n${data?.error ?? "Error inesperado"}`);
      setDeleting(false);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="font-medium">{program.name}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{program.type} · N{program.level} · {program.weeksCount} semanas</p>
        </div>

        <div className="space-y-2">
          <Link
            href={`/fisio/biblioteca/programas/${program.id}?view=1`}
            onClick={onClose}
            className="block w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 text-sm"
          >
            👁️ Ver detalle
          </Link>
          <Link
            href={`/fisio/biblioteca/programas/${program.id}`}
            onClick={onClose}
            className="block w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 text-sm"
          >
            ✏️ Editar contenido
          </Link>
          <button
            onClick={duplicate}
            disabled={duplicating || deleting}
            className="block w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 text-sm"
          >
            {duplicating ? "Duplicando..." : "📑 Duplicar"}
          </button>
          <button
            onClick={remove}
            disabled={duplicating || deleting}
            className="block w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-sm text-red-600"
          >
            {deleting ? "Eliminando..." : "🗑️ Eliminar"}
          </button>
        </div>

        <button onClick={onClose} className="mt-3 text-xs text-neutral-500 w-full text-center">
          Cancelar
        </button>
      </div>
    </div>
  );
}
