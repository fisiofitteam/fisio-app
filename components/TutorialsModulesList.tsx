"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, ROLE_ORDER, type ResourceRole } from "@/lib/resource-roles";

type ModuleItem = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  published: boolean;
  targetRoles: ResourceRole[];
  sectionsCount: number;
  lessonsCount: number;
};

export function TutorialsModulesList({
  modules,
  canManage,
  defaultRoles,
}: {
  modules: ModuleItem[];
  canManage: boolean;
  defaultRoles: ResourceRole[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ModuleItem | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function remove(id: string) {
    if (!confirm("¿Eliminar este módulo? Se perderán todas sus secciones y lecciones.")) return;
    await fetch(`/api/training/modules?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">
          {modules.length} módulo{modules.length !== 1 && "s"}
        </p>
        {canManage && (
          <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">
            + Nuevo módulo
          </button>
        )}
      </div>

      {modules.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12">
          No hay módulos todavía. {canManage ? "Crea el primero." : "Pídele al CEO que añada formación."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((m) => (
            <div key={m.id} className={`card !p-0 overflow-hidden ${m.published ? "" : "opacity-70"}`}>
              <Link href={`/fisio/recursos/tutoriales/${m.id}`} className="block">
                <div className="aspect-video bg-neutral-100 flex items-center justify-center">
                  {m.coverUrl ? (
                    <img src={m.coverUrl} alt={m.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl">🎓</span>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-medium text-sm">{m.title}</div>
                  {m.description && (
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{m.description}</p>
                  )}
                  <div className="text-[11px] text-neutral-400 mt-2">
                    {m.sectionsCount} sección{m.sectionsCount !== 1 && "es"} · {m.lessonsCount} lección{m.lessonsCount !== 1 && "es"}
                  </div>
                </div>
              </Link>
              {canManage && (
                <div className="px-3 py-2 border-t border-neutral-100 flex flex-wrap gap-1.5 items-center">
                  {m.targetRoles.map((r) => (
                    <span key={r} className="text-[10px] uppercase tracking-wide bg-neutral-100 text-neutral-600 rounded px-1.5 py-0.5">
                      {ROLE_LABELS[r]}
                    </span>
                  ))}
                  {!m.published && (
                    <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                      Oculto
                    </span>
                  )}
                  <span className="flex-1" />
                  <button onClick={() => setEditing(m)} className="text-xs text-neutral-500">Editar</button>
                  <button onClick={() => remove(m.id)} className="text-xs text-red-600">Borrar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <ModuleModal
          item={editing}
          defaultRoles={defaultRoles}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ModuleModal({
  item,
  defaultRoles,
  onClose,
  onSaved,
}: {
  item: ModuleItem | null;
  defaultRoles: ResourceRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(item?.coverUrl ?? "");
  const [published, setPublished] = useState(item?.published ?? true);
  const [targetRoles, setTargetRoles] = useState<ResourceRole[]>(item?.targetRoles ?? defaultRoles);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  function toggle(r: ResourceRole) {
    setTargetRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function uploadCover(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/training/upload", { method: "POST", body: form });
    setUploading(false);
    if (r.ok) {
      const data = await r.json();
      setCoverUrl(data.url);
    } else {
      const data = await r.json().catch(() => ({}));
      alert(data?.error ?? "No se pudo subir la imagen");
    }
  }

  async function save() {
    if (!title.trim() || targetRoles.length === 0) return;
    setSaving(true);
    const method = item ? "PATCH" : "POST";
    const payload = JSON.stringify({
      ...(item && { id: item.id }),
      title, description, coverUrl, published, targetRoles,
    });
    await fetch("/api/training/modules", { method, headers: { "Content-Type": "application/json" }, body: payload });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">{item ? "Editar módulo" : "Nuevo módulo"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción</label>
            <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Portada (imagen)</label>
            <div className="flex gap-2 items-start">
              {coverUrl && (
                <img src={coverUrl} alt="" className="w-24 h-16 object-cover rounded-md bg-neutral-100" />
              )}
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); }}
                  className="text-xs"
                  disabled={uploading}
                />
                {uploading && <p className="text-xs text-neutral-400 mt-1">Subiendo…</p>}
                {coverUrl && (
                  <button onClick={() => setCoverUrl("")} className="text-xs text-red-600 mt-1">Quitar imagen</button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Roles destinatarios (uno o varios)</label>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_ORDER.map((r) => {
                const checked = targetRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggle(r)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                      checked ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                    }`}
                  >
                    {checked && "✓ "}{ROLE_LABELS[r]}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Visible para el equipo (desmarca para ocultarlo)
          </label>
          <button
            onClick={save}
            disabled={!title.trim() || targetRoles.length === 0 || saving}
            className="btn btn-primary w-full"
          >
            {saving ? "Guardando…" : item ? "Guardar cambios" : "Crear módulo"}
          </button>
        </div>
      </div>
    </div>
  );
}
