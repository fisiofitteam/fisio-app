"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Hook = { id: string; text: string; notes: string; active: boolean };
type Audience = { id: string; name: string; description: string; active: boolean };

export function AdsBankView({ hooks, audiences }: { hooks: Hook[]; audiences: Audience[] }) {
  const [tab, setTab] = useState<"hooks" | "audiences">("hooks");

  return (
    <div>
      <nav className="flex gap-1 mb-4 border-b border-neutral-200">
        <button
          onClick={() => setTab("hooks")}
          className={`px-3 py-2 text-sm font-medium border-b-2 ${tab === "hooks" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"}`}
        >
          🎣 Hooks ({hooks.length})
        </button>
        <button
          onClick={() => setTab("audiences")}
          className={`px-3 py-2 text-sm font-medium border-b-2 ${tab === "audiences" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"}`}
        >
          👥 Audiencias ({audiences.length})
        </button>
      </nav>

      {tab === "hooks" ? <HooksPanel hooks={hooks} /> : <AudiencesPanel audiences={audiences} />}
    </div>
  );
}

function HooksPanel({ hooks }: { hooks: Hook[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Hook | null>(null);

  async function toggleActive(h: Hook) {
    await fetch("/api/ads/bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "hook", id: h.id, active: !h.active }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este hook?")) return;
    await fetch(`/api/ads/bank?id=${id}&kind=hook`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-neutral-500">Hooks ganadores reutilizables.</p>
        <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">+ Nuevo hook</button>
      </div>

      {hooks.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8 italic">Aún no hay hooks guardados.</p>
      ) : (
        <div className="space-y-2">
          {hooks.map((h) => (
            <div key={h.id} className={`card !p-3 ${h.active ? "" : "opacity-60"}`}>
              <p className="text-sm font-medium">{h.text}</p>
              {h.notes && <p className="text-xs text-neutral-500 mt-1">{h.notes}</p>}
              <div className="flex gap-2 mt-2 text-xs">
                <button onClick={() => toggleActive(h)} className="text-neutral-500">
                  {h.active ? "Archivar" : "Reactivar"}
                </button>
                <button onClick={() => setEditing(h)} className="text-neutral-500">Editar</button>
                <button onClick={() => remove(h.id)} className="text-red-600">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <HookModal
          item={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function HookModal({ item, onClose, onSaved }: { item: Hook | null; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(item?.text ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    const method = item ? "PATCH" : "POST";
    await fetch("/api/ads/bank", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "hook", ...(item && { id: item.id }), text, notes }),
    });
    onSaved();
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">{item ? "Editar hook" : "Nuevo hook"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Texto</label>
            <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="¿Te cuesta dormir del lado del hombro?" autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas (uso, contexto, resultado)</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button onClick={save} disabled={!text.trim() || saving} className="btn btn-primary w-full">
            {saving ? "Guardando…" : item ? "Guardar cambios" : "Crear hook"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AudiencesPanel({ audiences }: { audiences: Audience[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Audience | null>(null);

  async function toggleActive(a: Audience) {
    await fetch("/api/ads/bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "audience", id: a.id, active: !a.active }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta audiencia?")) return;
    await fetch(`/api/ads/bank?id=${id}&kind=audience`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-neutral-500">Audiencias guardadas para reutilizar en AdSets.</p>
        <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">+ Nueva audiencia</button>
      </div>

      {audiences.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8 italic">Sin audiencias guardadas.</p>
      ) : (
        <div className="space-y-2">
          {audiences.map((a) => (
            <div key={a.id} className={`card !p-3 ${a.active ? "" : "opacity-60"}`}>
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-xs text-neutral-600 mt-1 whitespace-pre-wrap">{a.description}</p>
              <div className="flex gap-2 mt-2 text-xs">
                <button onClick={() => toggleActive(a)} className="text-neutral-500">
                  {a.active ? "Archivar" : "Reactivar"}
                </button>
                <button onClick={() => setEditing(a)} className="text-neutral-500">Editar</button>
                <button onClick={() => remove(a.id)} className="text-red-600">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <AudienceModal
          item={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function AudienceModal({ item, onClose, onSaved }: { item: Audience | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!name.trim() || !description.trim()) return;
    setSaving(true);
    const method = item ? "PATCH" : "POST";
    await fetch("/api/ads/bank", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "audience", ...(item && { id: item.id }), name, description }),
    });
    onSaved();
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">{item ? "Editar audiencia" : "Nueva audiencia"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hombros CrossFit 25-45 ES" autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción / criterios</label>
            <textarea className="input" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Edad, intereses, ubicación, lookalike de pacientes, etc." />
          </div>
          <button onClick={save} disabled={!name.trim() || !description.trim() || saving} className="btn btn-primary w-full">
            {saving ? "Guardando…" : item ? "Guardar cambios" : "Crear audiencia"}
          </button>
        </div>
      </div>
    </div>
  );
}
