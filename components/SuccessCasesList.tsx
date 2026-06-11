"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SuccessCase = {
  id: string;
  name: string;
  injury: string;
  youtubeUrl: string;
  notes: string;
  active: boolean;
};

// Extrae el ID de un link de YouTube (watch?v=, youtu.be/, shorts/). Devuelve
// null si no lo reconocemos — la tarjeta entonces no muestra thumbnail.
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    return null;
  } catch {
    return null;
  }
}

export function SuccessCasesList({ cases }: { cases: SuccessCase[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SuccessCase | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function remove(id: string) {
    if (!confirm("¿Eliminar este caso? Lo más limpio es desactivarlo en lugar de borrarlo.")) return;
    await fetch(`/api/success-cases?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function toggleActive(c: SuccessCase) {
    await fetch("/api/success-cases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, active: !c.active }),
    });
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">
          {cases.length} caso{cases.length !== 1 && "s"}. El closer los selecciona desde el botón "📤 Enviar" de una tarea.
        </p>
        <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">+ Nuevo caso</button>
      </div>

      {cases.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-12">No hay casos todavía. Crea el primero.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cases.map((c) => {
          const yt = extractYouTubeId(c.youtubeUrl);
          return (
            <div key={c.id} className={`card !p-3 ${c.active ? "" : "opacity-60"}`}>
              <div className="flex gap-3">
                {yt ? (
                  <img
                    src={`https://img.youtube.com/vi/${yt}/mqdefault.jpg`}
                    alt={c.name}
                    className="w-24 h-16 object-cover rounded-md flex-shrink-0 bg-neutral-100"
                  />
                ) : (
                  <div className="w-24 h-16 rounded-md bg-neutral-100 flex items-center justify-center text-2xl flex-shrink-0">
                    🎬
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-xs text-neutral-600">{c.injury}</div>
                  {c.notes && <div className="text-[11px] text-neutral-400 mt-1 line-clamp-2">{c.notes}</div>}
                  {!c.active && <div className="text-[10px] text-amber-700 mt-1">Inactivo (no se muestra al closer)</div>}
                </div>
              </div>
              <div className="flex gap-2 mt-2 text-xs">
                <a href={c.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-neutral-900">
                  Ver vídeo →
                </a>
                <span className="flex-1" />
                <button onClick={() => toggleActive(c)} className="text-neutral-500">
                  {c.active ? "Desactivar" : "Reactivar"}
                </button>
                <button onClick={() => setEditing(c)} className="text-neutral-500">Editar</button>
                <button onClick={() => remove(c.id)} className="text-red-600">Borrar</button>
              </div>
            </div>
          );
        })}
      </div>

      {(showNew || editing) && (
        <CaseModal
          item={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CaseModal({ item, onClose, onSaved }: { item: SuccessCase | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [injury, setInjury] = useState(item?.injury ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(item?.youtubeUrl ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !injury.trim() || !youtubeUrl.trim()) return;
    setSaving(true);
    const method = item ? "PATCH" : "POST";
    const payload = JSON.stringify({ ...(item && { id: item.id }), name, injury, youtubeUrl, notes });
    await fetch("/api/success-cases", { method, headers: { "Content-Type": "application/json" }, body: payload });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{item ? "Editar caso" : "Nuevo caso de éxito"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Nombre del paciente</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana" autoFocus />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Lesión / motivo</label>
              <input className="input" value={injury} onChange={(e) => setInjury(e.target.value)} placeholder="rotura de supraespinoso" />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Link del vídeo (YouTube)</label>
            <input
              className="input"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtu.be/..."
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas internas (opcional)</label>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="No van al mensaje. Para acordarte del contexto del caso."
            />
          </div>
          <button
            onClick={save}
            disabled={!name.trim() || !injury.trim() || !youtubeUrl.trim() || saving}
            className="btn btn-primary w-full"
          >
            {saving ? "Guardando..." : item ? "Guardar cambios" : "Crear caso"}
          </button>
        </div>
      </div>
    </div>
  );
}
