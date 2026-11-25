"use client";
import { useState } from "react";
import type { EntryDTO, Feedback } from "@/lib/public-wod/contracts";
export function FeedbackForm({ entry, onSave, busy }: { entry: EntryDTO; onSave: (feedback: Feedback) => void; busy: boolean }) {
  const prior = entry.feedback;
  const [response, setResponse] = useState(prior?.response || "");
  const [painAfter, setPainAfter] = useState(prior?.painAfter?.toString() || (prior?.painAfter === 0 ? "0" : ""));
  const [painNextDay, setPainNextDay] = useState(prior?.painNextDay?.toString() || (prior?.painNextDay === 0 ? "0" : ""));
  const [nextDay, setNextDay] = useState(prior?.nextDay || "pending");
  const [effort, setEffort] = useState(prior?.effort?.toString() || "");
  const [notes, setNotes] = useState(prior?.notes || "");
  const [exercises, setExercises] = useState<Feedback["exercises"]>(prior?.exercises || entry.result.lines.filter(line => line.status !== "context").map(line => ({ key: line.key, performed: "skipped", hurt: false, actual: "" })));
  const nextDayAvailable = !!entry.completedAt && Date.now() - new Date(entry.completedAt).getTime() >= 18 * 3600000;
  const numbers = Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n}</option>);
  const updateExercise = (key: string, patch: Partial<Feedback["exercises"][number]>) => setExercises(exercises.map(e => e.key === key ? { ...e, ...patch } : e));
  return <form className="pw-feedback" onSubmit={e => { e.preventDefault(); onSave({ entryId: entry.id, response: response as Feedback["response"], painAfter: response === "not-done" ? null : Number(painAfter), painNextDay: painNextDay === "" ? null : Number(painNextDay), nextDay, effort: effort === "" ? null : Number(effort), notes, exercises: response === "not-done" ? exercises.map(e => ({ ...e, performed: "skipped", hurt: false, actual: "" })) : exercises }); }}>
    <h3>¿Cómo te ha ido?</h3><p>Tu registro ayudará a ajustar las próximas propuestas. Dolor previo registrado: <strong>{entry.painBefore}/10</strong>.</p>
    <label>Respuesta general<select required value={response} onChange={e => setResponse(e.target.value as Feedback["response"])}><option value="">Selecciona</option><option value="better">Mejor que antes</option><option value="same">Sin cambios</option><option value="worse">Peor que antes</option><option value="not-done">No he hecho este WOD</option></select></label>
    {response !== "not-done" && <>
      <div className="pw-grid"><label>Dolor después (0–10)<select required value={painAfter} onChange={e => setPainAfter(e.target.value)}><option value="">Selecciona</option>{numbers}</select></label><label>Esfuerzo (opcional, 0–10)<select value={effort} onChange={e => setEffort(e.target.value)}><option value="">Sin registrar</option>{numbers}</select></label></div>
      <fieldset><legend>Qué hiciste y qué te molestó</legend>{exercises.map(exercise => { const line = entry.result.lines.find(l => l.key === exercise.key)!; return <div key={exercise.key} className="pw-exercise-record"><strong>{line.original}</strong>{line.status === "replace" && <p>{line.instruction}</p>}<label>¿Qué hiciste?<select value={exercise.performed} onChange={e => updateExercise(exercise.key, { performed: e.target.value as Feedback["exercises"][number]["performed"], hurt: false })}><option value="skipped">No lo hice</option>{line.proposedMovementId && <option value="as-proposed">La propuesta de la herramienta</option>}<option value="changed">Otra variante / otra dosis</option></select></label>
        {exercise.performed === "changed" && <label>¿Qué variante o dosis realizaste?<input required maxLength={200} value={exercise.actual} onChange={e => updateExercise(exercise.key, { actual: e.target.value })} /></label>}
        {exercise.performed !== "skipped" && <label className="pw-check"><input type="checkbox" checked={exercise.hurt} onChange={e => updateExercise(exercise.key, { hurt: e.target.checked })} />Este ejercicio me produjo molestias.</label>}
      </div>; })}</fieldset>
      <fieldset disabled={!nextDayAvailable}><legend>Al día siguiente</legend>{!nextDayAvailable && <p className="pw-muted">Vuelve a este registro mañana. Se habilita a partir de 18 horas después de guardar que has terminado el WOD.</p>}<div className="pw-grid"><label>Cómo está el hombro<select value={nextDay} onChange={e => setNextDay(e.target.value as Feedback["nextDay"])}><option value="pending">Pendiente</option><option value="better">Mejor</option><option value="same">Igual</option><option value="worse">Peor</option></select></label><label>Dolor (0–10)<select value={painNextDay} onChange={e => setPainNextDay(e.target.value)}><option value="">Pendiente</option>{numbers}</select></label></div></fieldset>
    </>}
    <label>Algo más que quieras recordar<textarea maxLength={800} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    {(response === "worse" || Number(painAfter) >= 5 || nextDay === "worse" || exercises.some(e => e.hurt)) && <p className="pw-notice">No aumentes la exigencia con este empeoramiento. La próxima propuesta será más conservadora; si persiste o aparecen síntomas nuevos, consulta con un profesional.</p>}
    <button disabled={busy || !response || (response !== "not-done" && painAfter === "")}>{busy ? "Guardando…" : prior ? "Actualizar registro" : "Guardar sensaciones"}</button>
  </form>;
}
