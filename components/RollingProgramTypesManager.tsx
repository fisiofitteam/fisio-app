"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Plus, X, Sparkles } from "lucide-react";

type TypeRow = {
  id: string;
  name: string;
  description: string;
  aiBriefPrompt: string;
  active: boolean;
  programsCount: number;
};

export function RollingProgramTypesManager({
  canManage,
  initial,
}: {
  canManage: boolean;
  initial: TypeRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<TypeRow[]>(initial);
  const [editing, setEditing] = useState<TypeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function refresh() {
    const res = await fetch("/api/rolling-program-types").then((r) => r.json()).catch(() => []);
    if (Array.isArray(res)) {
      setItems(res.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        aiBriefPrompt: t.aiBriefPrompt ?? "",
        active: t.active,
        programsCount: t._count?.programs ?? 0,
      })));
    }
  }

  async function save(t: Partial<TypeRow> & { id?: string }) {
    const isNew = !t.id;
    const res = await fetch("/api/rolling-program-types", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: t.id,
        name: t.name?.trim(),
        description: t.description?.trim() ?? "",
        aiBriefPrompt: t.aiBriefPrompt?.trim() ?? "",
        active: t.active,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      flash("err", data.error || "No se pudo guardar");
      return;
    }
    flash("ok", isNew ? "Tipo creado" : "Cambios guardados");
    setEditing(null);
    setCreating(false);
    await refresh();
    router.refresh();
  }

  async function remove(t: TypeRow) {
    const extra = t.programsCount > 0
      ? `\n\nHay ${t.programsCount} programa(s) usando este tipo. Se desasocia (quedan sin tipo) pero NO se borran.`
      : "";
    if (!confirm(`¿Borrar el tipo "${t.name}"?${extra}`)) return;
    const res = await fetch(`/api/rolling-program-types?id=${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      flash("err", "No se pudo borrar");
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== t.id));
    flash("ok", "Tipo borrado");
    router.refresh();
  }

  return (
    <main>
      <header className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">🎯 Tipos de programa rolling</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Ej: "FisioFit Hybrid", "Running", "Hyrox"… Al asignar un programa a un tipo, aparecerá como opción
            en el slot personalizado del paciente.{" "}
            <Link href="/fisio/advance/rolling" className="underline">Volver a Rolling</Link>
          </p>
        </div>
        {canManage && (
          <button onClick={() => setCreating(true)} className="btn btn-primary text-sm flex items-center gap-1.5">
            <Plus size={14} /> Nuevo tipo
          </button>
        )}
      </header>

      {msg && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${msg.kind === "ok" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {msg.kind === "ok" ? "✓ " : "✗ "}{msg.text}
        </div>
      )}

      {creating && (
        <TypeForm
          initial={{ id: "", name: "", description: "", aiBriefPrompt: "", active: true, programsCount: 0 }}
          onCancel={() => setCreating(false)}
          onSave={save}
        />
      )}

      {items.length === 0 && !creating ? (
        <div className="card text-center py-8">
          <p className="text-sm text-neutral-500 italic">Aún no has creado ningún tipo personalizado.</p>
          {canManage && (
            <button onClick={() => setCreating(true)} className="mt-3 btn btn-primary text-sm">
              + Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            editing?.id === t.id ? (
              <TypeForm key={t.id} initial={editing} onCancel={() => setEditing(null)} onSave={save} />
            ) : (
              <div key={t.id} className="card flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{t.name}</span>
                    {!t.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">Archivado</span>}
                    {t.aiBriefPrompt && (
                      <span title="Tiene brief IA configurado" className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                        <Sparkles size={10} /> IA
                      </span>
                    )}
                    <span className="text-[10px] text-neutral-400">
                      {t.programsCount} programa{t.programsCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  {t.description && <p className="text-xs text-neutral-500 mt-0.5">{t.description}</p>}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setEditing(t)} title="Editar" className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => remove(t)} title="Borrar" className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      )}
    </main>
  );
}

function TypeForm({
  initial, onCancel, onSave,
}: {
  initial: TypeRow;
  onCancel: () => void;
  onSave: (t: Partial<TypeRow> & { id?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [aiBriefPrompt, setAiBriefPrompt] = useState(initial.aiBriefPrompt);
  const [active, setActive] = useState(initial.active);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      id: initial.id || undefined,
      name: name.trim(),
      description: description.trim(),
      aiBriefPrompt: aiBriefPrompt.trim(),
      active,
    });
    setSaving(false);
  }

  return (
    <div className="card border border-blue-200 bg-blue-50/40">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">{initial.id ? "Editar tipo" : "Nuevo tipo"}</h3>
        <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-900"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-neutral-600 block mb-1">Nombre</label>
          <input className="input text-sm w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: FisioFit Hybrid" />
        </div>
        <div>
          <label className="text-xs text-neutral-600 block mb-1">Descripción (opcional)</label>
          <input className="input text-sm w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Corta, aparece bajo el nombre" />
        </div>
        <div>
          <label className="text-xs text-neutral-600 block mb-1">
            Brief IA (opcional) — si vacío, el editor NO ofrece generación con IA
          </label>
          <textarea
            className="input text-sm w-full font-mono"
            rows={6}
            value={aiBriefPrompt}
            onChange={(e) => setAiBriefPrompt(e.target.value)}
            placeholder='System prompt que usa Claude cuando el fisio pulsa "generar semana con IA" en un programa de este tipo. Deja vacío si prefieres solo programación manual.'
          />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo (aparece en los dropdowns de asignación)
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="btn btn-ghost text-sm">Cancelar</button>
          <button onClick={submit} disabled={!name.trim() || saving} className="btn btn-primary text-sm">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
