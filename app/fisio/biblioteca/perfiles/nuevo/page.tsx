"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bodyZone, setBodyZone] = useState("hombro");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, bodyZone, description }),
    });
    const data = await res.json();
    router.push(`/fisio/biblioteca/perfiles/${data.id}`);
  }

  return (
    <main>
      <header className="mb-6">
        <Link href="/fisio/biblioteca/perfiles" className="text-xs text-neutral-500">← Perfiles</Link>
        <h1 className="text-xl font-semibold mt-1">Nuevo perfil clínico</h1>
        <p className="text-sm text-neutral-500">Define la patología o condición. Después le añades niveles.</p>
      </header>

      <section className="card space-y-3">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Nombre del perfil</label>
          <input
            className="input"
            placeholder="Ej: Rodilla: Tendinopatía rotuliana"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Zona corporal</label>
          <select className="input" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)}>
            <option value="hombro">Hombro</option>
            <option value="codo">Codo</option>
            <option value="muñeca">Muñeca</option>
            <option value="lumbar">Lumbar</option>
            <option value="cervical">Cervical</option>
            <option value="cadera">Cadera</option>
            <option value="rodilla">Rodilla</option>
            <option value="tobillo">Tobillo</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Descripción clínica (opcional)</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Descripción del cuadro clínico que cubre este perfil..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button onClick={create} disabled={!name.trim() || saving} className="btn btn-primary w-full">
          {saving ? "Creando..." : "Crear perfil"}
        </button>
      </section>
    </main>
  );
}
