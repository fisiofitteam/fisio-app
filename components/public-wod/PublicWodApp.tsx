"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Dumbbell, History, MessageCircle, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { ALTERNATIVES, WHATSAPP_NUMBER, type AdaptInput, type AlternativeId, type EntryDTO, type Feedback, type ProfileDTO, type SelfTest, type ShoulderProfile } from "@/lib/public-wod/contracts";
import { clinicalGate } from "@/lib/public-wod/engine";
import { Onboarding } from "./Onboarding";
import { FeedbackForm } from "./FeedbackForm";
import { SelfTestForm } from "./SelfTestForm";
import "./public-wod.css";
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api/public-wod/${path}`, { method, cache: "no-store", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: "No hemos podido conectar. Vuelve a intentarlo." }));
  if (!res.ok) throw Object.assign(new Error(data.error || "No se ha podido completar la acción."), { status: res.status });
  return data;
}
const labels = { context: "Formato", keep: "Mantén tu dosis tolerada", adjust: "Ajusta la exigencia", replace: "Cambia el ejercicio", confirm: "Confirma una alternativa", review: "Necesita aclaración" };
const readyOptions = [
  { value: "RED", title: "Hoy estoy peor", detail: "Más molestias, rigidez o fatiga." },
  { value: "AMBER", title: "Como habitualmente", detail: "Me mantengo estable." },
  { value: "GREEN", title: "Hoy estoy mejor", detail: "Menos molestias y más descanso." },
] as const;
export function PublicWodApp({ videos }: { videos: Record<string, string> }) {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [screen, setScreen] = useState<"loading" | "welcome" | "onboarding" | "app">("loading");
  const [tab, setTab] = useState<"adapt" | "history" | "profile" | "test" | "edit">("adapt");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [raw, setRaw] = useState("");
  const [readiness, setReadiness] = useState<AdaptInput["readiness"] | "">("");
  const [painBefore, setPainBefore] = useState("");
  const [safety, setSafety] = useState<"none" | "new" | "">("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<EntryDTO | null>(null);
  const [currentInput, setCurrentInput] = useState<AdaptInput | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const started = useRef(false);
  const busyRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const dayRef = useRef(new Date().toLocaleDateString());
  function invalidateResult() { setResult(null); setCurrentInput(null); requestIdRef.current = null; }
  useEffect(() => {
    const checkDay = () => { const day = new Date().toLocaleDateString(); if (day !== dayRef.current) { dayRef.current = day; setReadiness(""); setPainBefore(""); setSafety(""); setConfirmed(false); invalidateResult(); } };
    window.addEventListener("focus", checkDay); document.addEventListener("visibilitychange", checkDay);
    return () => { window.removeEventListener("focus", checkDay); document.removeEventListener("visibilitychange", checkDay); };
  }, []);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const key = new URLSearchParams(window.location.hash.slice(1)).get("acceso");
    if (key) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    (async () => {
      try { setProfile(key ? await api("session", "POST", { action: "restore", key }) : await api("profile")); setScreen("app"); }
      catch (e: any) { if (e.status !== 401 || key) setError(e.message); setScreen("welcome"); }
    })();
  }, []);
  async function work<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try { return await fn(); } catch (e: any) { setError(e.message || "Ha ocurrido un error. Inténtalo de nuevo."); } finally { busyRef.current = false; setBusy(false); }
  }
  async function saveProfile(data: { profile: ShoulderProfile; name: string; phone: string; marketingConsent: boolean; healthConsent: boolean }) {
    await work(async () => {
      if (profile) { const updated = await api("profile", "PATCH", { profile: data.profile }); setProfile(updated); setTab("profile"); setResult(null); setCurrentInput(null); setNotice("Perfil actualizado. Las próximas propuestas usarán estas respuestas."); }
      else {
        const params = new URLSearchParams(window.location.search);
        const created = await api("profile", "POST", { ...data, source: { source: (params.get("utm_source") || "directo").slice(0, 100), medium: (params.get("utm_medium") || "").slice(0, 100), campaign: (params.get("utm_campaign") || "").slice(0, 100) } });
        setProfile(created.profile); setAccessKey(created.recoveryKey); setScreen("app"); setTab("adapt"); setNotice("Tu perfil está guardado. Conserva tu enlace personal para volver desde otro dispositivo.");
      }
    });
  }
  function upsertEntry(entry: EntryDTO) {
    setProfile(previous => previous ? { ...previous, entries: [entry, ...previous.entries.filter(e => e.id !== entry.id)] } : previous);
  }
  async function adapt(alternative?: AlternativeId) {
    await work(async () => {
      const input: AdaptInput = alternative && currentInput && result ? { ...currentInput, entryId: result.id, confirmedAlternatives: Array.from(new Set([...currentInput.confirmedAlternatives, alternative])) }
        : { rawText: raw, readiness: readiness as AdaptInput["readiness"], painBefore: Number(painBefore), safetyToday: safety as "none" | "new", confirmedText: true, confirmedAlternatives: [], requestId: requestIdRef.current || (requestIdRef.current = crypto.randomUUID()) };
      const entry = await api("adapt", "POST", input); setCurrentInput(input); setResult(entry); upsertEntry(entry); setFeedbackId(null);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    });
  }
  async function readImage(file?: File) {
    if (!file) return;
    await work(async () => {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("Elige una imagen JPG, PNG, WEBP o GIF. Para HEIC, usa una captura de pantalla.");
      if (file.size > 15 * 1024 * 1024) throw new Error("La foto es demasiado grande. Usa una captura de pantalla.");
      const bitmap = await createImageBitmap(file);
      const factor = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * factor); canvas.height = Math.round(bitmap.height * factor);
      const context = canvas.getContext("2d"); if (!context) throw new Error("No se pudo preparar la imagen.");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .86));
      if (!blob) throw new Error("No se pudo preparar la imagen.");
      const form = new FormData(); form.append("image", blob, "wod.jpg");
      const data = await api("from-image", "POST", form); setRaw(data.text); setConfirmed(false); invalidateResult(); setNotice("Revisa ejercicios, repeticiones y cargas antes de continuar. Puedes corregir el texto.");
    });
  }
  function contact(kind: "question" | "case") {
    if (profile) api("contact", "POST", { kind }).catch(() => {});
    const message = `Hola, soy ${profile?.name || ""}. ${kind === "question" ? "Tengo una duda sobre mi adaptación del WOD." : "Me gustaría hablar con un fisio sobre mi caso."}${profile ? ` Mi referencia en el adaptador es ${profile.id}.` : ""}${kind === "question" && result ? ` WOD: ${result.id}.` : ""}`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }
  const wa = (kind: "question" | "case") => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola, soy ${profile?.name || ""}. ${kind === "question" ? "Tengo una duda sobre mi adaptación del WOD." : "Me gustaría hablar con un fisio sobre mi caso."}${profile ? ` Referencia: ${profile.id}.` : ""}${kind === "question" && result ? ` WOD: ${result.id}.` : ""}`)}`;
  async function copyAccess() {
    await work(async () => { const key = accessKey || (await api("session", "POST", { action: "recovery" })).recoveryKey; setAccessKey(key);
      await navigator.clipboard.writeText(`${location.origin}/adaptador-wod#acceso=${key}`); setNotice("Enlace copiado. Guárdalo en un lugar privado: permite acceder a tu perfil e historial. No lo compartas."); });
  }
  async function saveFeedback(feedback: Feedback) {
    await work(async () => { const entry = await api("feedback", "POST", feedback); upsertEntry(entry); if (result?.id === entry.id) setResult(entry); requestIdRef.current = null; setCurrentInput(null); setFeedbackId(null); setNotice("Registro guardado. Se tendrá en cuenta en tus próximas propuestas."); });
  }
  const gate = profile ? clinicalGate(profile.profile, "none") : null;
  function renderEntry(entry: EntryDTO, interactive: boolean) {
    return <article key={entry.id} className="pw-card pw-result">
      <div className="pw-row"><div><div className="pw-eyebrow">{new Date(entry.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" })} · Dolor previo {entry.painBefore}/10</div><h2>{entry.result.gate === "none" ? "Tu propuesta para este WOD" : "Antes de entrenar"}</h2></div><span className={`pw-dot ${entry.readiness.toLowerCase()}`}>{entry.readiness === "RED" ? "Peor" : entry.readiness === "GREEN" ? "Mejor" : "Estable"}</span></div>
      <p className={entry.result.gate === "none" ? "pw-muted" : "pw-notice pw-danger"}>{entry.result.message}</p>
      <p className="pw-notice">{entry.result.dailyAdvice}</p>
      {entry.result.lines.map(line => <div key={line.key} className={`pw-result-line ${line.status}`}><span className="pw-tag">{labels[line.status]}</span><h3>{line.original}</h3>{line.status !== "context" && <><p>{line.instruction}</p><p className="pw-muted">{line.reason}</p></>}
        {interactive && !entry.feedback && !!line.alternatives?.length && <div className="pw-alternatives"><p>Confirma solo una opción que ya hayas realizado sin empeorar durante ni después. No la pruebes ahora para poder marcarla.</p>{line.alternatives.map(id => <button type="button" className="pw-secondary" disabled={busy} key={id} onClick={() => adapt(id)}>Ya tolero: {ALTERNATIVES.find(a => a.id === id)!.name}</button>)}</div>}
      </div>)}
      {entry.feedback && <div className="pw-summary"><strong>Tu registro</strong><p>Dolor antes: {entry.painBefore}/10 · Después: {entry.feedback.painAfter ?? "pendiente"}{entry.feedback.painAfter !== null ? "/10" : ""} · Día siguiente: {entry.feedback.painNextDay ?? "pendiente"}{entry.feedback.painNextDay !== null ? "/10" : ""}</p><p>{entry.feedback.exercises.filter(e => e.hurt).length} ejercicios con molestias registradas.</p></div>}
      <div className="pw-actions">{entry.result.gate === "none" && <button className="pw-secondary" disabled={busy} onClick={() => setFeedbackId(feedbackId === entry.id ? null : entry.id)}>{entry.feedback ? "Ver / actualizar sensaciones" : "Registrar cómo ha ido"}</button>}<a className="pw-button" href={wa("case")} target="_blank" rel="noreferrer" onClick={() => contact("case")}>Hablar con un fisio sobre mi caso</a></div>
      {feedbackId === entry.id && <FeedbackForm key={entry.id} entry={entry} onSave={saveFeedback} busy={busy} />}
    </article>;
  }
  return <div className="pw-shell"><header className="pw-header"><a href="/adaptador-wod" className="pw-brand"><Dumbbell size={24} /><span>FISIOFIT<span className="pw-yellow">CROSS</span></span></a><span className="pw-free">Herramienta gratuita</span></header>
    <main className="pw-main">
      {error && <div className="pw-notice pw-danger" role="alert">{error}<button className="pw-link" onClick={() => setError("")}>Cerrar aviso</button></div>}
      {notice && <div className="pw-notice pw-success" role="status"><Check size={18} />{notice}</div>}
      {screen === "loading" && <p className="pw-loading" role="status">Cargando tu espacio…</p>}
      {screen === "welcome" && <section className="pw-hero"><div className="pw-eyebrow">Crosstraining · Dolor de hombro</div><h1>Tu WOD de hoy.<br /><span>Con opciones para ti.</span></h1><p className="pw-hero-copy">Cuéntanos cómo responde tu hombro, sube el entrenamiento y recibe una propuesta para ajustarlo. Guarda cómo te ha ido para orientar el siguiente.</p><button onClick={() => setScreen("onboarding")}>Crear mi perfil gratuito</button><p className="pw-muted">Sin pago ni límite de WODs. Tu perfil queda guardado.</p><div className="pw-feature-grid"><article><SlidersHorizontal /><h2>Tu punto de partida</h2><p>Preguntas sencillas sobre lo que toleras y lo que te molesta.</p></article><article><Camera /><h2>Foto, captura o texto</h2><p>Revisa lo que hemos leído y adapta el WOD del box.</p></article><article><History /><h2>Aprende de tus registros</h2><p>Dolor antes y después, ejercicios y respuesta al día siguiente.</p></article></div><p className="pw-muted">¿Ya tienes perfil? Abre tu enlace personal de acceso en este dispositivo.</p><div className="pw-trust"><ShieldCheck size={20} /><p>Orientación sobre entrenamiento para mayores de 18 años. Algunas respuestas necesitan valoración profesional antes de generar adaptaciones.</p></div></section>}
      {screen === "onboarding" && <Onboarding onSave={saveProfile} onCancel={() => setScreen("welcome")} busy={busy} />}
      {screen === "app" && profile && <>
        <div className="pw-dashboard-heading"><div className="pw-eyebrow">Tu espacio de entrenamiento</div><h1>Vamos con tu WOD, {profile.name.split(" ")[0]}.</h1></div>
        <nav className="pw-nav" aria-label="Tu adaptador">{[["adapt", "Adaptar WOD"], ["history", "Mi historial"], ["profile", "Mi perfil"]].map(([value, title]) => <button className={tab === value ? "active" : ""} key={value} onClick={() => { setTab(value as typeof tab); setFeedbackId(null); }} aria-current={tab === value ? "page" : undefined}>{title}</button>)}</nav>
        {tab === "edit" && <Onboarding initial={profile.profile} onSave={saveProfile} onCancel={() => setTab("profile")} busy={busy} />}
        {tab === "test" && <SelfTestForm initial={profile.selfTest} videos={videos} busy={busy} onCancel={() => setTab("profile")} onSave={test => { work(async () => { setProfile(await api("profile", "PATCH", { selfTest: test })); invalidateResult(); setHistoryOffset(0); setTab("adapt"); setNotice("Respuestas guardadas para las próximas propuestas."); }); }} />}
        {tab === "adapt" && <>
          {!profile.selfTest && gate?.gate === "none" && <div className="pw-test-banner"><div><strong>¿Quieres añadir más contexto?</strong><p>El autotest de hombro es opcional. Puedes hacerlo ahora o después.</p></div><button className="pw-secondary" onClick={() => setTab("test")}>Ver autotest</button></div>}
          {accessKey && <div className="pw-access"><p>Guarda tu enlace privado para volver desde otro dispositivo.</p><button className="pw-secondary" onClick={copyAccess} disabled={busy}>Copiar mi enlace de acceso</button></div>}
          {gate?.gate !== "none" ? <section className="pw-card"><h2>Antes de adaptar</h2><p className="pw-notice">{gate?.message}</p><button onClick={() => setTab("edit")}>Revisar mis respuestas</button></section> : <section className="pw-card"><h2>¿Cómo estás hoy?</h2>
            <div className="pw-readiness">{readyOptions.map(option => <label key={option.value} className={`pw-readiness-option ${option.value.toLowerCase()} ${readiness === option.value ? "selected" : ""}`}><input type="radio" name="readiness" value={option.value} checked={readiness === option.value} disabled={busy} onChange={() => { setReadiness(option.value); invalidateResult(); }} /><strong>{option.title}</strong><span>{option.detail}</span></label>)}</div>
            <div className="pw-grid"><label>Dolor antes de entrenar (0–10)<select disabled={busy} value={painBefore} onChange={e => { setPainBefore(e.target.value); invalidateResult(); }}><option value="">Selecciona</option>{Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n === 0 ? "0 · Sin dolor" : n === 10 ? "10 · Máximo dolor imaginable" : n}</option>)}</select></label><label>¿Hay alguna señal nueva de alarma?<select disabled={busy} value={safety} onChange={e => { setSafety(e.target.value as typeof safety); invalidateResult(); }}><option value="">Selecciona</option><option value="none">No</option><option value="new">Sí / tengo dudas</option></select></label></div>
            <p className="pw-muted">Señales: lesión reciente sin valorar, dolor intenso repentino, pérdida de fuerza o sensibilidad, fiebre, presión en el pecho o falta de aire.</p>
            {safety === "new" && <div className="pw-notice pw-danger">Busca valoración sanitaria antes de entrenar. Con presión en el pecho o falta de aire, llama al 112. No esperes una respuesta por WhatsApp.</div>}
            <div className="pw-divider" /><div className="pw-row"><h2>El entrenamiento de hoy</h2><label className={`pw-upload ${busy ? "disabled" : ""}`}><Camera size={18} />Subir foto o captura<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy || safety === "new"} onChange={e => { readImage(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
            <label>WOD original<textarea disabled={busy} className="pw-wod-input" maxLength={6000} value={raw} onChange={e => { setRaw(e.target.value); setConfirmed(false); invalidateResult(); }} placeholder={"AMRAP 12 min\n10 thrusters 30 kg\n8 pull-ups\n200 m run"} /></label>
            <label className="pw-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />He revisado los movimientos, las repeticiones y las cargas. Cada movimiento está en una línea.</label>
            <button disabled={busy || !readiness || painBefore === "" || !safety || !confirmed || raw.trim().length < 3} onClick={() => adapt()}>{busy ? "Preparando…" : "Adaptar mi WOD"}</button>
          </section>}
          <div ref={resultRef}>{result && renderEntry(result, true)}</div>
        </>}
        {tab === "history" && <section><div className="pw-row"><h2>Tu historial</h2><span className="pw-muted">Guardado solo para ti</span></div>{!profile.entries.length && <div className="pw-card"><p>Aquí aparecerán tus WODs y sensaciones. Empieza con tu primer entrenamiento.</p><button onClick={() => setTab("adapt")}>Adaptar un WOD</button></div>}{profile.entries.map(entry => renderEntry(entry, false))}{profile.hasMore && <button disabled={busy} className="pw-secondary" onClick={() => work(async () => { const next = historyOffset + 20; const page = await api(`profile?offset=${next}`); setProfile({ ...profile, entries: [...profile.entries, ...page.entries.filter((e: EntryDTO) => !profile.entries.some(p => p.id === e.id))], hasMore: page.hasMore }); setHistoryOffset(next); })}>Cargar más registros</button>}</section>}
        {tab === "profile" && <section className="pw-card"><h2>Tu perfil</h2><p><strong>{profile.name}</strong> · {profile.phone}</p><p>Tu objetivo: {profile.profile.goal}</p><div className="pw-actions"><button onClick={() => setTab("edit")}>Actualizar mis respuestas</button>{gate?.gate === "none" && <button className="pw-secondary" onClick={() => setTab("test")}>{profile.selfTest ? "Revisar autotest" : "Autotest opcional"}</button>}</div><div className="pw-divider" /><h3>Acceso y privacidad</h3><p>Este navegador recuerda tu acceso durante 180 días de uso. El enlace personal abre tu perfil desde otro dispositivo: guárdalo en privado.</p><button className="pw-secondary" disabled={busy} onClick={copyAccess}>Copiar mi enlace de acceso</button>
          <label className="pw-check"><input type="checkbox" disabled={busy} checked={profile.marketingConsent} onChange={e => { const consent = e.target.checked; work(async () => { setProfile(await api("profile", "PATCH", { marketingConsent: consent })); setNotice(consent ? "Preferencia guardada." : "Has retirado el permiso de seguimiento comercial."); }); }} />Quiero recibir seguimiento y comunicaciones comerciales por WhatsApp.</label><p className="pw-muted">Retirar este permiso no afecta a tu acceso ni a las respuestas a las consultas que solicites.</p>
          <div className="pw-actions"><button className="pw-secondary" disabled={busy} onClick={() => work(async () => { await api("session", "POST", { action: "logout" }); setProfile(null); setAccessKey(""); setResult(null); setScreen("welcome"); })}>Cerrar sesión</button><button className="pw-link" onClick={() => setDeleteConfirm(true)}>Borrar mi perfil y registros</button></div>
          {deleteConfirm && <div className="pw-notice pw-danger"><p>Se eliminarán tu contacto, respuestas e historial de esta herramienta. Esta acción no se puede deshacer.</p><div className="pw-actions"><button disabled={busy} onClick={() => work(async () => { await api("profile", "DELETE"); setProfile(null); setAccessKey(""); setResult(null); setScreen("welcome"); setDeleteConfirm(false); setNotice("Tu perfil y sus registros se han eliminado."); })}>Confirmar borrado</button><button className="pw-secondary" onClick={() => setDeleteConfirm(false)}>Cancelar</button></div></div>}
        </section>}
      </>}
      <footer className="pw-footer"><span>FisioFitCross · Entrena con contexto.</span><a href="/adaptador-wod/privacidad">Privacidad</a><a href="/terminos">Términos</a></footer>
    </main>
    {screen === "app" && <a className="pw-contact" href={wa("question")} target="_blank" rel="noreferrer" onClick={() => contact("question")}><MessageCircle size={20} />Tengo dudas sobre mi adaptación</a>}
  </div>;
}
