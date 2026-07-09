"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlideCanvas } from "@/components/StoryMaker/SlideCanvas";
import type { Slide } from "@/lib/story-maker/types";

type StoryTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  slides: Slide[];
  aiSlots: any[];
  updatedAt: string;
};

/**
 * Manager de plantillas de Story Maker dentro de /fisio/contenido/plantilla.
 * TODAS las plantillas viven en BD (las 4 "builtin" se instancian con
 * "cargar de ejemplo"). Cualquiera puede editarse, duplicarse o borrarse.
 */
export function StoryTemplatesManager({
  initialTemplates,
  canEdit,
}: {
  initialTemplates: StoryTemplateRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialTemplates);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function refresh() {
    const res = await fetch("/api/story-maker/templates").then((r) => r.json()).catch(() => ({}));
    if (res?.ok) setItems(res.templates);
  }

  async function duplicate(t: StoryTemplateRow) {
    setBusy(t.id);
    const res = await fetch("/api/story-maker/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${t.name} (copia)`,
        description: t.description ?? "",
        slides: t.slides,
        aiSlots: t.aiSlots,
      }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      flash("ok", `"${t.name}" duplicada`);
      await refresh();
      router.refresh();
    } else {
      flash("err", data.error || "No se pudo duplicar");
    }
  }

  async function seedBuiltins() {
    setBusy("__seed");
    const res = await fetch("/api/story-maker/templates/seed-builtins", { method: "POST" });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      flash("ok", `${(data.created ?? []).length} plantillas de ejemplo cargadas`);
      await refresh();
      router.refresh();
    } else {
      flash("err", data.error || "No se pudo cargar los ejemplos");
    }
  }

  async function remove(t: StoryTemplateRow) {
    if (!confirm(`¿Borrar la plantilla "${t.name}"? No se puede deshacer.`)) return;
    setBusy(t.id);
    const res = await fetch(`/api/story-maker/templates?id=${t.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) {
      setItems((prev) => prev.filter((x) => x.id !== t.id));
      flash("ok", "Plantilla borrada");
      router.refresh();
    } else {
      flash("err", "No se pudo borrar");
    }
  }

  return (
    <section className="card mt-4 relative overflow-hidden">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div>
          <h2 className="font-medium text-sm">🎨 Plantillas de historias (Story Maker)</h2>
          <p className="text-xs text-neutral-500">
            Composiciones para reutilizar en Instagram Stories. Puedes editar, duplicar o borrar cualquiera.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={seedBuiltins}
              disabled={busy === "__seed"}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
              title="Añade 4 plantillas base (Portada, Cita, Lista, Pregunta). Ignora las que ya existan por nombre."
            >
              {busy === "__seed" ? "Cargando…" : "+ Cargar ejemplos"}
            </button>
          )}
          <Link
            href="/fisio/contenido/story-maker"
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-neutral-900 text-white hover:bg-neutral-800"
          >
            + Nueva plantilla
          </Link>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-3 px-3 py-2 rounded-lg text-xs ${
            msg.kind === "ok"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {msg.kind === "ok" ? "✓ " : "✗ "}
          {msg.text}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 py-10 text-center space-y-3">
          <p className="text-sm text-neutral-500 italic">
            Aún no hay plantillas de historia.
          </p>
          {canEdit && (
            <button
              onClick={seedBuiltins}
              disabled={busy === "__seed"}
              className="inline-block text-xs font-semibold px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy === "__seed" ? "Cargando…" : "🎨 Cargar 4 plantillas de ejemplo"}
            </button>
          )}
          <div>
            <Link
              href="/fisio/contenido/story-maker"
              className="inline-block text-xs font-medium underline text-neutral-700"
            >
              o ir al Story Maker para crear una desde cero →
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-neutral-200 bg-white overflow-hidden hover:border-neutral-400 transition-colors"
            >
              <div className="aspect-[9/16] bg-neutral-950 relative overflow-hidden flex items-center justify-center">
                {t.slides[0] ? (
                  <SlideCanvas slide={t.slides[0]} scale={0.12} />
                ) : (
                  <span className="text-xs text-neutral-500 italic">Sin slides</span>
                )}
              </div>
              <div className="p-3 space-y-2">
                <div>
                  <div className="font-semibold text-sm truncate">{t.name}</div>
                  {t.description && (
                    <div className="text-[11px] text-neutral-500 line-clamp-2">
                      {t.description}
                    </div>
                  )}
                  <div className="text-[10px] text-neutral-400 mt-1">
                    {t.slides.length} slide{t.slides.length === 1 ? "" : "s"}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 pt-1">
                    <Link
                      href={`/fisio/contenido/story-maker?edit=${t.id}`}
                      className="flex-1 text-xs font-medium px-2 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 text-center"
                    >
                      ✏ Editar
                    </Link>
                    <button
                      onClick={() => duplicate(t)}
                      disabled={busy === t.id}
                      className="text-xs font-medium px-2 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                      title="Duplicar"
                    >
                      ⎘
                    </button>
                    <button
                      onClick={() => remove(t)}
                      disabled={busy === t.id}
                      className="text-xs font-medium px-2 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      title="Borrar"
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
