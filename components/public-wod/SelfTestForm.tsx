"use client";
import { useState } from "react";
import type { SelfTest } from "@/lib/public-wod/contracts";
import { youtubeEmbedUrl } from "@/lib/youtube";
const TESTS = [
  { key: "wallSlide", video: "test1", name: "Deslizamiento en pared", description: "Observa cómo toleras elevar los brazos junto a la pared, sin forzar el recorrido." },
  { key: "rotation", video: "test2", name: "Rotación torácica", description: "Observa el giro del tronco. No saques conclusiones sobre una lesión a partir de esta prueba." },
  { key: "overheadSquat", video: "test3", name: "Sentadilla con palo sobre la cabeza", description: "Solo si ya conoces y toleras el gesto. Usa un palo ligero y tu recorrido cómodo." },
  { key: "inclineHold", video: "test4", name: "Apoyo en flexión", description: "Solo si ya toleras este apoyo. No hace falta llegar al límite ni aguantar un tiempo concreto." },
] as const;
export function SelfTestForm({ initial, videos, onSave, onCancel, busy }: { initial: SelfTest | null; videos: Record<string, string>; onSave: (test: SelfTest) => void; onCancel: () => void; busy: boolean }) {
  const [values, setValues] = useState<SelfTest>(initial || { wallSlide: "skip", rotation: "skip", overheadSquat: "skip", inclineHold: "skip" });
  const [openVideo, setOpenVideo] = useState<string | null>(null);
  return <section className="pw-card"><div className="pw-eyebrow">Opcional · Sin puntuación diagnóstica</div><h2>Añade contexto a tu hombro</h2><p>Puedes saltarte cualquier prueba. Si aparece dolor, detente y marca «Me molesta»; no repitas para intentar mejorar el resultado.</p>
    <form onSubmit={e => { e.preventDefault(); onSave(values); }}>{TESTS.map(test => { const embed = videos[test.video] ? youtubeEmbedUrl(videos[test.video]) : null; return <fieldset className="pw-pattern" key={test.key}><legend>{test.name}</legend><p>{test.description}</p>{embed && <><button type="button" className="pw-secondary" onClick={() => setOpenVideo(openVideo === test.key ? null : test.key)}>{openVideo === test.key ? "Cerrar vídeo" : "Ver demostración"}</button>{openVideo === test.key && <iframe title={test.name} className="pw-video" src={embed} referrerPolicy="no-referrer" allowFullScreen />}</>}
      <label>¿Cómo lo toleras?<select value={values[test.key]} onChange={e => setValues({ ...values, [test.key]: e.target.value })}><option value="skip">No lo he hecho / prefiero saltarlo</option><option value="comfortable">Cómodo en mi recorrido</option><option value="limited">Recorrido limitado, sin dolor</option><option value="pain">Me molesta</option></select></label></fieldset>; })}
      <p className="pw-muted">Un resultado cómodo no desbloquea ejercicios ni aumenta cargas. Las molestias añaden cautela a los grupos relacionados.</p><div className="pw-actions"><button type="button" className="pw-secondary" onClick={onCancel}>Volver</button><button disabled={busy}>{busy ? "Guardando…" : "Guardar respuestas"}</button></div>
    </form></section>;
}
