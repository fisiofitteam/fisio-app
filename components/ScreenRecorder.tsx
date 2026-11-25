"use client";
import { useEffect, useState } from "react";
import { useRecordingWorkspace } from "./RecordingWorkspace";
import type { RecordingFolderOption } from "./RecordingList";

/** A launcher only. Capture and the draft live in the persistent professional layout. */
export function ScreenRecorder({ patientId, patientName, enabled, onBusyChange, defaultFolderId }: {
  defaultFolderId?: string; folders?: RecordingFolderOption[]; patientId?: string; patientName?: string;
  professionalId: string; enabled: boolean; onBusyChange?: (busy: boolean) => void; onSaved?: () => void;
}) {
  const workspace = useRecordingWorkspace();
  const [camera, setCamera] = useState(true), [microphone, setMicrophone] = useState(true);
  const [systemAudio, setSystemAudio] = useState(false), [transcribe, setTranscribe] = useState(true);
  const canTranscribe = workspace.speechSupported && (systemAudio ? workspace.mixedSpeechSupported : microphone);
  useEffect(() => { onBusyChange?.(workspace.busy); }, [workspace.busy, onBusyChange]);
  return <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-4">
    <div><h3 className="font-semibold text-lg">Grabar explicación o videollamada</h3><p className="text-sm text-neutral-500">{patientId ? "Para " + patientName + ". " : "Grabación general, sin paciente. "}Puedes moverte por las secciones de la app mientras grabas.</p></div>
    {!enabled && <p className="text-sm text-amber-700">El almacenamiento privado todavía no está conectado.</p>}
    {!workspace.supported && <p className="text-sm text-amber-700">Para grabar, abre esta página en Chrome o Edge desde un ordenador.</p>}
    {workspace.busy && !workspace.recovering ? <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm">Tienes una grabación en curso o pendiente de guardar.</p>
      <button type="button" className="btn btn-accent" onClick={workspace.show}>Abrir grabación</button>
    </div> : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Tipo de grabación">
        <button type="button" aria-pressed={!systemAudio} onClick={() => { setSystemAudio(false); setMicrophone(true); }} className={"rounded-xl border p-3 text-left " + (!systemAudio ? "border-amber-400 bg-amber-50" : "border-neutral-200")}>
          <span className="block font-semibold">🎙️ Explicación</span><span className="text-xs text-neutral-600">Tu pantalla y tu voz</span>
        </button>
        <button type="button" aria-pressed={systemAudio} onClick={() => { setSystemAudio(true); setMicrophone(true); }} className={"rounded-xl border p-3 text-left " + (systemAudio ? "border-amber-400 bg-amber-50" : "border-neutral-200")}>
          <span className="block font-semibold">💬 Videollamada</span><span className="text-xs text-neutral-600">Tu voz y la del cliente</span>
        </button>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex gap-2 items-center"><input type="checkbox" checked={camera} onChange={e => setCamera(e.target.checked)} /> Cámara</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={microphone} onChange={e => setMicrophone(e.target.checked)} /> Micrófono</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={systemAudio} onChange={e => setSystemAudio(e.target.checked)} /> Incluir audio del cliente / ordenador</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={transcribe && canTranscribe} disabled={!canTranscribe} onChange={e => setTranscribe(e.target.checked)} /> Transcribir audio</label>
      </div>
      {systemAudio && <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-950 space-y-1">
        <p className="font-semibold">Al elegir qué compartir, activa también «Compartir audio».</p>
        <p>Para Meet u otra llamada web, elige la pestaña de la llamada. Para una aplicación de escritorio, el audio depende de las opciones que ofrezca tu navegador y sistema.</p>
        <p className="text-xs">Comprueba que se mueve el indicador «Cliente / ordenador» cuando hable. Usa auriculares para evitar que su voz entre también por tu micrófono.</p>
      </div>}
      {canTranscribe && transcribe && <p className="text-xs text-neutral-500">Transcripción en español {systemAudio ? (microphone ? "de tu voz y del audio compartido" : "del audio compartido") : "del micrófono"}, mediante el servicio de voz del navegador. Requiere conexión y puede contener errores; podrás revisar el texto antes de guardarlo.</p>}
      {systemAudio && workspace.speechSupported && !workspace.mixedSpeechSupported && <p className="text-xs text-amber-700">Puedes grabar ambas voces en el vídeo. Para transcribir el audio compartido, utiliza Chrome o Edge actualizado en un ordenador.</p>}
      {!workspace.speechSupported && <p className="text-xs text-neutral-500">La transcripción no está disponible en este navegador. Puedes grabar el vídeo igualmente.</p>}
      <p className="text-xs text-neutral-500">Elige esta pestaña para mostrar la app, otra pestaña, WhatsApp o toda la pantalla. Mantén la pestaña abierta: puedes navegar por la app, pero no recargarla. Máximo 30 minutos o 500 MB.</p>
      <button type="button" className="btn btn-accent" disabled={!enabled || !workspace.supported || workspace.busy}
        onClick={() => workspace.start({ patientId, patientName, defaultFolderId, camera, microphone, systemAudio, transcribe: transcribe && canTranscribe })}>
        {workspace.recovering ? "Comprobando grabaciones pendientes…" : "● Empezar a grabar"}
      </button>
    </>}
    {!workspace.busy && workspace.message && <p role="status" className="text-sm">{workspace.message}</p>}
  </div>;
}
