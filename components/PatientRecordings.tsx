"use client";
import { ScreenRecorder } from "./ScreenRecorder";
import { RecordingList, type RecordingFolderOption, type RecordingSummary } from "./RecordingList";
export function PatientRecordings({ patientId, patientName, professionalId, enabled, recordings, folders }: { patientId: string; patientName: string; professionalId: string; enabled: boolean; recordings: RecordingSummary[]; folders?: RecordingFolderOption[] }) {
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">Grabaciones</h2><p className="text-sm text-neutral-500">Archivo interno del equipo. No aparece en el panel del paciente.</p></div>
    <ScreenRecorder folders={folders} patientId={patientId} patientName={patientName} professionalId={professionalId} enabled={enabled} />
    <RecordingList folders={folders} recordings={recordings} />
  </section>;
}
