"use client";
import { useState } from "react";
import { EQUIPMENT, EQUIPMENT_LABELS, GROUPS, SAFETY_FLAGS, TOLERANCES, type ShoulderProfile } from "@/lib/public-wod/contracts";

export function Onboarding({ initial, onSave, onCancel, busy }: { initial?: ShoulderProfile; onSave: (data: { profile: ShoulderProfile; name: string; phone: string; marketingConsent: boolean; healthConsent: boolean }) => void; onCancel: () => void; busy: boolean }) {
  const [step, setStep] = useState(0);
  const [health, setHealth] = useState(!!initial);
  const [adult, setAdult] = useState(!!initial);
  const [none, setNone] = useState(initial?.safetyFlags.length === 0);
  const [flags, setFlags] = useState<string[]>(initial?.safetyFlags || []);
  const [side, setSide] = useState(initial?.side || "");
  const [duration, setDuration] = useState(initial?.duration || "");
  const [onset, setOnset] = useState(initial?.onset || "");
  const [timing, setTiming] = useState<string[]>(initial?.timing || []);
  const [diagnosis, setDiagnosis] = useState(initial?.diagnosis || "");
  const [restrictions, setRestrictions] = useState(initial?.restrictions || "");
  const [restrictionNotes, setRestrictionNotes] = useState(initial?.restrictionNotes || "");
  const [groups, setGroups] = useState<Record<string, string>>(initial?.groups || {});
  const [trainingDays, setTrainingDays] = useState(initial?.trainingDays?.toString() || "");
  const [experience, setExperience] = useState(initial?.experience || "");
  const [equipment, setEquipment] = useState<string[]>(initial?.equipment || []);
  const [goal, setGoal] = useState(initial?.goal || "");
  const [tried, setTried] = useState(initial?.tried || "");
  const [intent, setIntent] = useState(initial?.intent || "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+34");
  const [marketing, setMarketing] = useState(false);
  const titles = ["Primero, tu situación", "Cuéntanos qué notas", "Cómo responde tu hombro", "Tu entrenamiento", initial ? "Tu objetivo" : "Guarda tu perfil"];
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];
  const valid = [health && adult && (none || flags.length > 0) && !flags.length, !!side && !!duration && !!onset && timing.length > 0 && !!restrictions,
    GROUPS.every(g => !!groups[g.id]), trainingDays !== "" && !!experience, goal.trim().length >= 3 && !!intent && (!!initial || (name.trim().length >= 2 && /^\+[1-9]\d{7,14}$/.test(phone)))][step];
  function save() {
    const profile = { adult: true, side, duration, onset, timing, diagnosis, restrictions, restrictionNotes, groups, trainingDays: Number(trainingDays), experience, equipment, goal, tried, intent, safetyFlags: flags, safetyReviewed: true } as ShoulderProfile;
    onSave({ profile, name, phone, marketingConsent: marketing, healthConsent: health });
  }
  return <section className="pw-card pw-onboarding">
    <div className="pw-eyebrow">{initial ? "Actualizar perfil" : "Tu perfil de hombro"} · Paso {step + 1} de {titles.length}</div>
    <div className="pw-progress" aria-label={`Paso ${step + 1} de ${titles.length}`}><span style={{ width: `${(step + 1) / titles.length * 100}%` }} /></div>
    <h2>{titles[step]}</h2>
    <form onSubmit={e => { e.preventDefault(); if (valid) step < 4 ? setStep(step + 1) : save(); }}>
      {step === 0 && <>
        <p>Esta herramienta orienta sobre el entrenamiento. Hay situaciones que necesitan valoración antes de empezar.</p>
        <label className="pw-check"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} /> Tengo 18 años o más.</label>
        <label className="pw-check"><input type="checkbox" checked={health} onChange={e => setHealth(e.target.checked)} /> Consiento que FisioFit trate mis respuestas de salud y registros para personalizar las propuestas y conservar mi historial. Puedo borrar mi perfil cuando quiera. <a href="/adaptador-wod/privacidad" target="_blank" rel="noreferrer">Información sobre mis datos</a>.</label>
        {health && adult && <fieldset><legend>¿Te ocurre alguna de estas situaciones ahora?</legend>
          {SAFETY_FLAGS.map(flag => <label className="pw-check" key={flag.id}><input type="checkbox" checked={flags.includes(flag.id)} onChange={() => { setFlags(toggle(flags, flag.id)); setNone(false); }} />{flag.label}</label>)}
          <label className="pw-check"><input type="checkbox" checked={!!none} onChange={e => { setNone(e.target.checked); setFlags([]); }} />Ninguna de las anteriores.</label>
        </fieldset>}
        {!!flags.length && <div className="pw-notice pw-danger" role="alert">{flags.includes("chest") ? "Deja el entrenamiento y llama al 112. No esperes una respuesta por WhatsApp." : "Antes de entrenar, busca valoración sanitaria urgente para estas señales. No hagas las pruebas ni esperes una respuesta por WhatsApp."}</div>}
      </>}
      {step === 1 && <>
        <label>¿Qué hombro te molesta?<select value={side} onChange={e => setSide(e.target.value as typeof side)} required><option value="">Selecciona</option><option value="right">Derecho</option><option value="left">Izquierdo</option><option value="both">Ambos</option></select></label>
        <label>¿Desde cuándo?<select value={duration} onChange={e => setDuration(e.target.value as typeof duration)} required><option value="">Selecciona</option><option value="under2w">Menos de 2 semanas</option><option value="2w3m">Entre 2 semanas y 3 meses</option><option value="3m12m">Entre 3 meses y un año</option><option value="over1y">Más de un año</option></select></label>
        <label>¿Cómo empezó?<select value={onset} onChange={e => setOnset(e.target.value as typeof onset)} required><option value="">Selecciona</option><option value="gradual">Poco a poco</option><option value="movement">Con un movimiento concreto</option><option value="trauma">Tras un golpe o lesión ya valorados</option><option value="unknown">No lo sé</option></select></label>
        <fieldset><legend>¿Cuándo lo notas? Puedes marcar varias.</legend><div className="pw-options">{[["during", "Durante el entrenamiento"], ["after", "Después"], ["nextday", "Al día siguiente"], ["rest", "También en reposo"]].map(([value, label]) => <label key={value} className="pw-check"><input type="checkbox" checked={timing.includes(value)} onChange={() => setTiming(toggle(timing, value))} />{label}</label>)}</div></fieldset>
        <label>¿Te han dado algún diagnóstico? <span className="pw-muted">Opcional</span><input maxLength={600} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Si no tienes diagnóstico, puedes dejarlo vacío" /></label>
        <label>¿Tienes restricciones indicadas por un profesional?<select value={restrictions} onChange={e => setRestrictions(e.target.value as typeof restrictions)} required><option value="">Selecciona</option><option value="none">No</option><option value="yes">Sí</option><option value="unsure">No estoy seguro</option></select></label>
        {restrictions && restrictions !== "none" && <><label>¿Qué te han indicado?<textarea maxLength={600} value={restrictionNotes} onChange={e => setRestrictionNotes(e.target.value)} /></label><p className="pw-notice">Guardaremos tu contexto, pero necesitaremos aclarar esas indicaciones antes de generar cambios automáticos.</p></>}
      </>}
      {step === 2 && <><p>Piensa en cómo te ha ido recientemente. No necesitas probar estos movimientos ahora.</p>{GROUPS.map(group => <fieldset key={group.id} className="pw-pattern"><legend>{group.name}</legend><p className="pw-muted">{group.examples}</p><div className="pw-options">{TOLERANCES.map(option => <label key={option.id} className={`pw-choice ${groups[group.id] === option.id ? "selected" : ""}`}><input type="radio" name={group.id} checked={groups[group.id] === option.id} onChange={() => setGroups({ ...groups, [group.id]: option.id })} />{option.label}</label>)}</div></fieldset>)}</>}
      {step === 3 && <>
        <label>¿Cuántos días entrenas a la semana?<select value={trainingDays} onChange={e => setTrainingDays(e.target.value)} required><option value="">Selecciona</option>{Array.from({ length: 8 }, (_, n) => <option value={n} key={n}>{n === 0 ? "Ahora no estoy entrenando" : n}</option>)}</select></label>
        <label>¿Cuánto tiempo llevas haciendo crosstraining?<select value={experience} onChange={e => setExperience(e.target.value as typeof experience)} required><option value="">Selecciona</option><option value="new">Menos de un año</option><option value="1to3">Entre uno y tres años</option><option value="over3">Más de tres años</option></select></label>
        <fieldset><legend>¿Qué material tienes disponible?</legend><div className="pw-options">{EQUIPMENT.map(item => <label className="pw-check" key={item}><input type="checkbox" checked={equipment.includes(item)} onChange={() => setEquipment(toggle(equipment, item))} />{EQUIPMENT_LABELS[item]}</label>)}</div><p className="pw-muted">Puedes dejarlo vacío si solo entrenas con tu peso corporal.</p></fieldset>
      </>}
      {step === 4 && <>
        <label>¿Qué te gustaría volver a hacer con confianza?<textarea value={goal} onChange={e => setGoal(e.target.value)} maxLength={400} minLength={3} required placeholder="Por ejemplo: volver a hacer snatch sin estar pendiente del hombro" /></label>
        <label>¿Qué has probado hasta ahora? <span className="pw-muted">Opcional</span><textarea value={tried} onChange={e => setTried(e.target.value)} maxLength={600} /></label>
        <label>¿Qué necesitas en este momento?<select value={intent} onChange={e => setIntent(e.target.value as typeof intent)} required><option value="">Selecciona</option><option value="adapt">Orientarme con mis entrenamientos</option><option value="help">También quiero que me contactéis para hablar de mi recuperación</option><option value="unsure">Todavía no lo sé</option></select></label>
        {!initial && <><div className="pw-divider" /><p>Guarda tu perfil para volver con el siguiente WOD. Recibirás un enlace personal de acceso en pantalla.</p>
          <label>Tu nombre<input autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} required /></label>
          <label>WhatsApp con prefijo internacional<input type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/[\s()-]/g, ""))} placeholder="+34600111222" pattern="\+[1-9][0-9]{7,14}" required /></label>
          <p className="pw-muted">Usaremos este contacto si pides ayuda. El número no se utiliza como contraseña ni se verifica por SMS.</p>
          <label className="pw-check"><input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} />Quiero recibir seguimiento y comunicaciones de FisioFit sobre sus servicios por WhatsApp. Opcional; puedo retirarlo desde mi perfil.</label>
        </>}
      </>}
      <div className="pw-actions"><button type="button" className="pw-secondary" disabled={busy} onClick={() => step ? setStep(step - 1) : onCancel()}>{step ? "Anterior" : "Volver"}</button><button type="submit" disabled={!valid || busy}>{busy ? "Guardando…" : step === 4 ? "Guardar mi perfil" : "Continuar"}</button></div>
    </form>
  </section>;
}
