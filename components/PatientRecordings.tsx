"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Recording = { id: string; title: string; url: string; notes: string | null; createdAt: string };
export function PatientRecordings({ patientId, serverUrl, recordings }: { patientId: string; serverUrl: string | null; recordings: Recording[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = "/api/patients/" + encodeURIComponent(patientId) + "/recordings";
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data)) });
      if (!response.ok) throw new Error((await response.json()).error || "No se pudo guardar.");
      form.reset(); router.refresh(); setMessage("Grabación guardada.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("¿Quitar esta grabación del historial? El vídeo seguirá en Cap.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint + "?id=" + encodeURIComponent(id), { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo quitar la grabación.");
      router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Error al quitar."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <div className="flex justify-between items-start gap-3 flex-wrap"><div><h2 className="text-lg font-semibold">Grabaciones</h2><p className="text-sm text-neutral-500">Archivo interno del equipo. No aparece en el panel del paciente.</p></div>
      {serverUrl && <a className="btn btn-accent" href={serverUrl} target="_blank" rel="noreferrer">Abrir Cap ↗</a>}
    </div>
    <p className="text-sm text-neutral-600">Graba con Cap la pantalla, WhatsApp o cualquier ventana. Al terminar, pega aquí el enlace para asociarlo a este paciente.</p>
    {!serverUrl && <p className="text-sm rounded-lg bg-amber-50 p-3">El servidor propio de Cap aún no está conectado. Puedes guardar enlaces de grabaciones que ya tengas en Cap.</p>}
    <form onSubmit={save} className="card space-y-3">
      <label className="block text-sm">Título<input name="title" required maxLength={160} className="block w-full border rounded-lg p-2 mt-1" placeholder="Revisión de ejercicios" /></label>
      <label className="block text-sm">Enlace de Cap<input name="url" type="url" required maxLength={2048} className="block w-full border rounded-lg p-2 mt-1" placeholder="https://…" /></label>
      <label className="block text-sm">Notas internas<textarea name="notes" maxLength={5000} className="block w-full border rounded-lg p-2 mt-1" /></label>
      <button disabled={busy} className="btn btn-accent">{busy ? "Guardando…" : "Guardar grabación"}</button>
    </form>
    <p role="status" className="text-sm">{message}</p>
    {!recordings.length && <p className="text-sm text-neutral-500">Todavía no hay grabaciones guardadas.</p>}
    {recordings.map(r => <article className="card space-y-2" key={r.id}>
      <h3 className="font-semibold">{r.title}</h3><p className="text-xs text-neutral-500">{new Date(r.createdAt).toLocaleDateString("es-ES")}</p>
      {r.notes && <p className="text-sm whitespace-pre-wrap break-words">{r.notes}</p>}
      <div className="flex gap-3 flex-wrap text-sm"><a href={r.url} target="_blank" rel="noreferrer" className="underline">Ver grabación ↗</a>
        <button onClick={async () => { try { await navigator.clipboard.writeText(r.url); setMessage("Enlace copiado."); } catch { setMessage("No se pudo copiar. Abre la grabación y copia su enlace."); } }}>Copiar enlace</button>
        <button disabled={busy} onClick={() => remove(r.id)} className="text-red-700">Quitar del historial</button></div>
    </article>)}
  </section>;
}
