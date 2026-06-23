"use client";
/**
 * Cabecera editable del programa.
 *
 * - Por defecto muestra título + chips (zona / tipo / nivel / semanas) tal cual.
 * - Botón "✏️ Editar" abre un formulario inline con los mismos campos que
 *   "Nuevo programa", precargados con los valores actuales.
 * - Guarda con PATCH /api/programs y refresca la ruta del server component.
 *
 * `weeksCount` NO se edita: cambiarlo aquí no añade ni quita semanas
 * realmente (las semanas son filas en ProgramWeek). Si lo necesitamos
 * después, lo añadimos como cambio aparte.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type Program = {
  id: string;
  name: string;
  bodyZone: string;
  type: string;
  level: number;
  weeksCount: number;
  description: string | null;
};

const BODY_ZONES = ["hombro", "lumbar", "rodilla", "otros"];
const TYPES = ["Movilidad", "Tendinoso", "Exposición", "Fuerza", "Activación", "Cardio", "Recuperación", "Otro"];

export function ProgramHeaderEditable({ program }: { program: Program }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(program.name);
  const [bodyZone, setBodyZone] = useState(program.bodyZone);
  const [type, setType] = useState(program.type);
  const [level, setLevel] = useState(program.level);
  const [description, setDescription] = useState(program.description ?? "");
  const [saving, setSaving] = useState(false);

  function cancel() {
    setName(program.name);
    setBodyZone(program.bodyZone);
    setType(program.type);
    setLevel(program.level);
    setDescription(program.description ?? "");
    setEdit(false);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/programs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: program.id,
          name: name.trim(),
          bodyZone,
          type,
          level: Number(level),
          description: description.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d?.error || "No se pudo guardar");
        return;
      }
      setEdit(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!edit) {
    return (
      <header className="mb-6">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <h1 className="text-xl font-semibold mt-1">{program.name}</h1>
          <button onClick={() => setEdit(true)} className="text-xs text-neutral-500 hover:text-neutral-900 border border-neutral-200 rounded px-2 py-1">
            ✏️ Editar
          </button>
        </div>
        <p className="text-sm text-neutral-500 flex items-center gap-2 mt-1 flex-wrap">
          <span className="px-2 py-0.5 bg-neutral-100 rounded-full text-xs capitalize">{program.bodyZone}</span>
          <span className="text-xs">{program.type}</span>
          <span className="text-xs">· Nivel {program.level}</span>
          <span className="text-xs">· {program.weeksCount} semanas</span>
        </p>
        {program.description && <p className="text-sm text-neutral-600 mt-2">{program.description}</p>}
      </header>
    );
  }

  return (
    <header className="mb-6 card space-y-3 border-neutral-300">
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-medium">Editar metadatos del programa</h2>
        <button onClick={cancel} className="text-xs text-neutral-400 hover:text-neutral-700">Cancelar</button>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Zona corporal</label>
          <select className="input capitalize" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)}>
            {BODY_ZONES.map((z) => (
              <option key={z} value={z} className="capitalize">{z}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Capacidad / tipo</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
            {/* Si el actual es un tipo libre antiguo, lo mantenemos como opción seleccionable */}
            {!TYPES.includes(type) && <option value={type}>{type} (actual)</option>}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Nivel</label>
        <select className="input" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Nivel {n}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={cancel} disabled={saving} className="text-xs btn btn-ghost border border-neutral-200 px-3 py-1.5">Cancelar</button>
        <button onClick={save} disabled={saving || !name.trim()} className="text-xs btn btn-primary px-3 py-1.5">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
      <p className="text-[11px] text-neutral-400">
        Para añadir o quitar semanas usa los controles del contenido del programa más abajo; aquí sólo se cambian los metadatos.
      </p>
    </header>
  );
}
