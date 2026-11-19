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
  useEffect(() => { onBusyChange?.(workspace.busy); }, [workspace.busy, onBusyChange]);
  return <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-4">
    <div><h3 className="font-semibold text-lg">Grabar explicación</h3><p className="text-sm text-neutral-500">{patientId ? "Para " + patientName + ". " : "Grabación general, sin paciente. "}Puedes moverte por las secciones de la app mientras grabas.</p></div>
    {!enabled && <p className="text-sm text-amber-700">El almacenamiento privado todavía no está conectado.</p>}
    {!workspace.supported && <p className="text-sm text-amber-700">Para grabar, abre esta página en Chrome o Edge desde un ordenador.</p>}
    {workspace.busy && !workspace.recovering ? <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm">Tienes una grabación en curso o pendiente de guardar.</p>
      <button type="button" className="btn btn-accent" onClick={workspace.show}>Abrir grabación</button>
    </div> : <>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex gap-2 items-center"><input type="checkbox" checked={camera} onChange={e => setCamera(e.target.checked)} /> Cámara</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={microphone} onChange={e => setMicrophone(e.target.checked)} /> Micrófono</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={systemAudio} onChange={e => setSystemAudio(e.target.checked)} /> Audio de la pestaña o pantalla</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={transcribe && microphone && workspace.speechSupported} disabled={!microphone || !workspace.speechSupported} onChange={e => setTranscribe(e.target.checked)} /> Transcribir mi voz</label>
      </div>
      {workspace.speechSupported && transcribe && microphone && <p className="text-xs text-neutral-500">Transcripción en español del micrófono, mediante el servicio de voz del navegador. Requiere conexión; no incluye las voces del audio compartido. Podrás revisar el texto antes de guardarlo.</p>}
      {!workspace.speechSupported && <p className="text-xs text-neutral-500">La transcripción no está disponible en este navegador. Puedes grabar el vídeo igualmente.</p>}
      <p className="text-xs text-neutral-500">Elige esta pestaña para mostrar la app, otra pestaña, WhatsApp o toda la pantalla. Mantén la pestaña abierta: puedes navegar por la app, pero no recargarla. Máximo 30 minutos o 500 MB.</p>
      <button type="button" className="btn btn-accent" disabled={!enabled || !workspace.supported || workspace.busy}
        onClick={() => workspace.start({ patientId, patientName, defaultFolderId, camera, microphone, systemAudio, transcribe: transcribe && microphone && workspace.speechSupported })}>
        {workspace.recovering ? "Comprobando grabaciones pendientes…" : "● Empezar a grabar"}
      </button>
    </>}
    {!workspace.busy && workspace.message && <p role="status" className="text-sm">{workspace.message}</p>}
  </div>;
}
