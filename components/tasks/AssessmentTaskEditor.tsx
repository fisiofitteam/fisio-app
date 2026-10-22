"use client";
import { useEffect, useState } from "react";
import { parseAssessment, validateAssessment, type AssessmentTest } from "@/lib/assessments";
export function AssessmentTaskEditor({ task, onClose, onSave }: { task: any; onClose: () => void; onSave?: (snapshot: any) => void }) {
  const initial = parseAssessment(task.assessment);
  const [title, setTitle] = useState(task.title || "Valoración");
  const [instructions, setInstructions] = useState(initial.instructions);
  const [tests, setTests] = useState<AssessmentTest[]>(initial.tests);
  const [library, setLibrary] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/library").then(r => r.json()).then(a => setLibrary(Array.isArray(a) ? a : [])).catch(() => {}); }, []);
  function add(ex?: any) {
    setTests(prev => [...prev, { id: crypto.randomUUID(), name: ex?.name || "", instructions: ex?.description || "", videoUrl: ex?.youtubeUrl || "" }]);
    setSearch("");
  }
  function update(id: string, patch: Partial<AssessmentTest>) { setTests(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t)); }
  function move(i: number, step: number) {
    setTests(prev => { const a = [...prev]; [a[i], a[i + step]] = [a[i + step], a[i]]; return a; });
  }
  async function save() {
    setError(""); setSaving(true);
    try {
      if (!title.trim() || !tests.length) throw new Error("Añade un título y al menos un test.");
      const assessment = validateAssessment({ instructions, tests });
      if (onSave) onSave({ ...task, title: title.trim(), assessment });
      else {
        const r = await fetch("/api/programs/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, title: title.trim(), assessment }) });
        if (!r.ok) throw new Error((await r.json()).error || "No se pudo guardar.");
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  }
  return <div className="space-y-4">
    <p className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-900">🩺 Una valoración, varios test. Cada test tendrá su propia entrega de vídeo.</p>
    <label className="block text-sm">Título de la valoración<input className="input mt-1" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} /></label>
    <label className="block text-sm">Instrucciones generales<textarea className="input mt-1" value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} /></label>
    {tests.map((t, i) => <section key={t.id} className="border border-neutral-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Test {i + 1}</h4><div className="flex gap-2">
        <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir test" className="disabled:opacity-30">↑</button>
        <button type="button" disabled={i === tests.length - 1} onClick={() => move(i, 1)} aria-label="Bajar test" className="disabled:opacity-30">↓</button>
        <button type="button" onClick={() => setTests(prev => prev.filter(x => x.id !== t.id))} className="text-xs text-red-600">Quitar test</button>
      </div></div>
      <label className="block text-xs">Nombre<input className="input mt-1" value={t.name} onChange={e => update(t.id, { name: e.target.value })} placeholder="Ej.: Flexión de hombro" maxLength={200} /></label>
      <label className="block text-xs">Cómo realizarlo y grabarlo<textarea className="input mt-1" value={t.instructions} onChange={e => update(t.id, { instructions: e.target.value })} rows={3} /></label>
      <label className="block text-xs">Enlace al vídeo de ejemplo<input className="input mt-1" type="url" value={t.videoUrl} onChange={e => update(t.id, { videoUrl: e.target.value })} placeholder="https://…" /></label>
    </section>)}
    <button type="button" onClick={() => add()} disabled={tests.length >= 30} className="btn btn-ghost text-sm">+ Añadir test</button>
    {tests.length < 30 && <div><label className="text-xs">O añadir desde la biblioteca<input className="input mt-1" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ejercicio por nombre…" /></label>
      {search && <div className="max-h-44 overflow-auto border rounded-lg">{library.filter(ex => ex.name.toLowerCase().includes(search.toLowerCase())).slice(0, 15).map(ex => <button type="button" key={ex.id} onClick={() => add(ex)} className="block w-full text-left text-sm p-2 hover:bg-neutral-50">{ex.name}</button>)}</div>}
    </div>}
    <p className="text-xs text-neutral-500">El cliente verá: «Recorta cada vídeo a un minuto como máximo. Puedes subir archivos de hasta 1 GB».</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex justify-end gap-2 border-t pt-3"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar valoración"}</button></div>
  </div>;
}
