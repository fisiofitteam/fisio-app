"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProgramPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bodyZone, setBodyZone] = useState("hombro");
  const [weeksCount, setWeeksCount] = useState(4);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    // type/level se mantienen en el modelo pero no se piden en la UI; van con
    // un valor neutro para no romper consultas viejas que aún los lean.
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, bodyZone, type: "—", level: 1, weeksCount, description }),
    });
    const data = await res.json();
    router.push(`/fisio/biblioteca/programas/${data.id}`);
  }

  return (
    <main>
      <header className="mb-6">
        <Link href="/fisio/biblioteca/programas" className="text-xs text-neutral-500">← Programas</Link>
        <h1 className="text-xl font-semibold mt-1">Nuevo programa</h1>
        <p className="text-xs text-neutral-500 mt-1">El título ya refleja la capacidad/nivel; aquí pedimos sólo lo imprescindible.</p>
      </header>

      <section className="card space-y-3">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
          <input className="input" placeholder="Ej: Movilidad escapular · Nivel 2" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Zona corporal</label>
            <select className="input" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)}>
              <option value="hombro">Hombro</option>
              <option value="lumbar">Lumbar</option>
              <option value="rodilla">Rodilla</option>
              <option value="otros">Otros</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Semanas</label>
            <input type="number" className="input" min={1} max={52} value={weeksCount} onChange={(e) => setWeeksCount(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button onClick={create} disabled={!name.trim() || saving} className="btn btn-primary w-full">
          {saving ? "Creando..." : "Crear y editar contenido"}
        </button>
      </section>
    </main>
  );
}
