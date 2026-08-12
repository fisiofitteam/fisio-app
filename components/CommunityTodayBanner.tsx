"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Banner persistente que aparece en TODAS las páginas del layout /fisio
 * cuando al profesional actual le toca publicar en la comunidad hoy y aún
 * no lo ha marcado como hecho.
 *
 * Se auto-carga al montar. Botón "✓ Marcar como publicado" hace PATCH al
 * endpoint existente /api/community/posts y oculta el banner. El link al
 * texto lleva a /fisio/comunidad/plan.
 *
 * Estilo amarillo, mismo patrón que el banner de "Completa tu dirección"
 * del paciente.
 */
type TodayPost = {
  id: string;
  categoriesLabel: string;
  note: string | null;
  text: string | null;
};

export function CommunityTodayBanner() {
  const [post, setPost] = useState<TodayPost | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/community/today-me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.post) setPost(data.post);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function markDone() {
    if (!post || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/community/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id, done: true }),
      });
      if (res.ok) setDismissed(true);
    } finally {
      setSaving(false);
    }
  }

  if (!post || dismissed) return null;

  return (
    <div
      className="mb-3 rounded-lg px-4 py-3 flex items-start gap-3 flex-wrap"
      style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#78350F" }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          📢 Hoy te toca publicar en la comunidad
          <span
            className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: "#FDE68A", color: "#78350F" }}
          >
            {post.categoriesLabel}
          </span>
        </div>
        {post.note && (
          <p className="text-xs mt-1" style={{ color: "#92400E" }}>
            {post.note}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href="/fisio/comunidad/plan"
          className="text-xs font-medium underline"
          style={{ color: "#78350F" }}
        >
          Ver plan
        </Link>
        <button
          onClick={markDone}
          disabled={saving}
          className="text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          {saving ? "Guardando…" : "✓ Ya publicado"}
        </button>
      </div>
    </div>
  );
}
