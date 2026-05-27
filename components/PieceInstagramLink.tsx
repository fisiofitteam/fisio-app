"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type IgPost = { id: string; caption: string; timestamp: string; permalink: string; reach: number; likes: number };

const fdate = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

export function PieceInstagramLink({
  pieceId, igMediaId, suggestion, recent,
}: {
  pieceId: string;
  igMediaId: string | null;
  suggestion: IgPost | null;
  recent: IgPost[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);

  async function link(mediaId: string) {
    setBusy(true);
    const res = await fetch(`/api/content/pieces/${pieceId}/instagram`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
    if (res.ok) { setPicker(false); router.refresh(); }
    else { alert("No se pudo vincular el post."); setBusy(false); }
  }
  async function unlink() {
    if (!confirm("¿Desvincular este post de Instagram? Las métricas dejarán de sincronizarse.")) return;
    setBusy(true);
    await fetch(`/api/content/pieces/${pieceId}/instagram`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlink" }),
    }).catch(() => {});
    router.refresh();
  }

  // Ya vinculado
  if (igMediaId) {
    return (
      <div className="mb-3 rounded-lg p-2.5 text-xs flex items-center justify-between gap-2" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
        <span className="text-emerald-800">🔗 Vinculado a Instagram · métricas sincronizadas automáticamente</span>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setPicker(true)} className="text-emerald-700 hover:underline">Cambiar</button>
          <button onClick={unlink} disabled={busy} className="text-red-600 hover:underline">Desvincular</button>
        </div>
        {picker && <PickerModal recent={recent} onPick={link} onClose={() => setPicker(false)} busy={busy} />}
      </div>
    );
  }

  // No vinculado — sugerencia por fecha
  return (
    <div className="mb-3 rounded-lg p-2.5 text-xs" style={{ background: "#FEFCE8", border: "1px solid #FDE68A" }}>
      {suggestion ? (
        <>
          <div className="text-amber-900 mb-1.5">📷 ¿Es esta la publicación de Instagram de esta pieza?</div>
          <div className="bg-white rounded p-2 border border-amber-200 mb-2">
            <a href={suggestion.permalink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{fdate(suggestion.timestamp)}</a>
            <span className="text-neutral-600"> · {suggestion.caption || "(sin texto)"}</span>
            <div className="text-neutral-400 mt-0.5">Alcance {suggestion.reach.toLocaleString("es-ES")} · {suggestion.likes} likes</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => link(suggestion.id)} disabled={busy} className="font-semibold px-2.5 py-1 rounded" style={{ background: "#FCD34D", color: "#0A0A0A" }}>
              Sí, vincular y traer métricas
            </button>
            <button onClick={() => setPicker(true)} className="text-amber-800 hover:underline">Elegir otra</button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-amber-900">📷 Vincula esta pieza con su post de Instagram para traer las métricas.</span>
          <button onClick={() => setPicker(true)} className="font-semibold px-2.5 py-1 rounded flex-shrink-0" style={{ background: "#FCD34D", color: "#0A0A0A" }}>Elegir publicación</button>
        </div>
      )}
      {picker && <PickerModal recent={recent} onPick={link} onClose={() => setPicker(false)} busy={busy} />}
    </div>
  );
}

function PickerModal({ recent, onPick, onClose, busy }: { recent: IgPost[]; onPick: (id: string) => void; onClose: () => void; busy: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium text-sm">Elige la publicación de Instagram</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-400 italic py-4">No se han podido cargar publicaciones recientes.</p>
        ) : (
          <div className="space-y-1">
            {recent.map((p) => (
              <button key={p.id} onClick={() => onPick(p.id)} disabled={busy} className="w-full text-left p-2 rounded-lg hover:bg-neutral-100 text-xs">
                <div className="font-medium">{fdate(p.timestamp)} · alcance {p.reach.toLocaleString("es-ES")}</div>
                <div className="text-neutral-500 truncate">{p.caption || "(sin texto)"}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
