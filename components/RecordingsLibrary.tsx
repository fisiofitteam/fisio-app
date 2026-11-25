"use client";
import { useCallback, useEffect, useState } from "react";
import type { RecordingLibraryResult } from "@/lib/recording-library";
import { ScreenRecorder } from "./ScreenRecorder";
import { RecordingFolderManager } from "./RecordingFolderManager";
import { RecordingList, type RecordingFolderOption } from "./RecordingList";

type PatientOption = { id: string; fullName: string };
export function RecordingsLibrary({ initialData, patients, professionalId, enabled, initialFolders }: {
  initialFolders: RecordingFolderOption[]; initialData: RecordingLibraryResult; patients: PatientOption[]; professionalId: string; enabled: boolean;
}) {
  const [folders, setFolders] = useState(initialFolders), [folderFilter, setFolderFilter] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [q, setQ] = useState(""), [patientFilter, setPatientFilter] = useState("");
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState(initialData), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const selectedPatient = patients.find(patient => patient.id === selectedPatientId);
  useEffect(() => { window.addEventListener("recordings:changed", reload); return () => window.removeEventListener("recordings:changed", reload); }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, patientId: patientFilter, folderId: folderFilter, page: String(page) });
        const response = await fetch("/api/recordings?" + params, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 ? "No tienes acceso a estas grabaciones." : "No se han podido cargar las grabaciones.");
        const next = await response.json();
        if (!controller.signal.aborted) setData(next);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No se han podido cargar las grabaciones.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, q ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, patientFilter, folderFilter, page, revision]);

  return <main className="space-y-6">
    <header><h1 className="text-2xl font-semibold">Grabaciones</h1><p className="mt-1 text-sm text-neutral-500">Graba explicaciones, presentaciones o vídeos para el equipo. Vincularlos a un paciente es opcional.</p></header>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 space-y-3">
      <div><h2 className="font-semibold">FisioFit Recorder para Chrome</h2><p className="text-sm text-neutral-600 mt-1">Empieza desde el icono del navegador y sigue grabando aunque cierres el panel de controles.</p></div>
      <a href="/api/recordings/extension" className="btn btn-accent" download>Descargar extensión · versión de prueba</a>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Cómo instalarla</summary><ol className="list-decimal pl-5 mt-3 space-y-2"><li>Descarga y descomprime el ZIP.</li><li>Abre <code>chrome://extensions</code> y activa «Modo de desarrollador».</li><li>Pulsa «Cargar descomprimida» y selecciona la carpeta <strong>FisioFit-Recorder</strong>.</li><li>Fija FisioFit Recorder desde el icono de extensiones de Chrome. Pulsa su icono para grabar.</li></ol><p className="mt-3 text-neutral-500">Mantén esa carpeta en tu ordenador. Para actualizar, guarda los vídeos pendientes, sustituye el contenido de esa carpeta por el nuevo paquete y pulsa «Recargar» en chrome://extensions. Cerrar Chrome interrumpe una grabación en curso; los vídeos ya terminados se conservan localmente.</p></details>
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-4" aria-label="Nueva grabación">
      <div><h2 className="text-lg font-semibold">Nueva grabación</h2><p className="text-sm text-neutral-500">Puedes grabar sin paciente. Si seleccionas uno, el vídeo se guardará también en su ficha, dentro de Evolución e historial → Grabaciones.</p></div>
      <label className="block text-sm font-medium">Paciente (opcional)
        <select value={selectedPatientId} disabled={recordingBusy || !patients.length} onChange={e => setSelectedPatientId(e.target.value)} className="mt-1 block w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-2.5 disabled:opacity-60">
          <option value="">Sin paciente · grabación general</option>
          {patients.map(patient => <option key={patient.id} value={patient.id}>{patient.fullName}</option>)}
        </select>
      </label>
      {!selectedPatient && <p className="text-xs text-neutral-500">Las grabaciones generales son privadas para su autor y dirección. Puedes compartirlas por enlace.</p>}
      {recordingBusy && <p className="text-xs text-neutral-500">Guarda o descarta la grabación antes de cambiar de paciente.</p>}
      {<ScreenRecorder folders={folders} defaultFolderId={folders.some(f => f.id === folderFilter) ? folderFilter : ""} key={selectedPatient?.id || "general"} patientId={selectedPatient?.id} patientName={selectedPatient?.fullName}
        professionalId={professionalId} enabled={enabled} onBusyChange={setRecordingBusy} onSaved={reload} />}
    </section>
    <RecordingFolderManager folders={folders} selected={folderFilter} onSelect={id => { setFolderFilter(id); setPage(1); }} onChanged={next => { setFolders(next); reload(); }} />
    <section aria-label="Buscar grabaciones" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Buscar por título o paciente<input type="search" value={q} maxLength={160} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Buscar grabaciones…" className="mt-1 w-full rounded-lg border border-neutral-200 bg-white p-2.5" /></label>
        <label className="text-sm">Filtrar por paciente<select value={patientFilter} onChange={e => { setPatientFilter(e.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-neutral-200 bg-white p-2.5">
          <option value="">Todas las grabaciones</option><option value="none">Sin paciente</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.fullName}</option>)}
        </select></label>
      </div>
      {loading && <p role="status" className="text-sm text-neutral-500">Cargando grabaciones…</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={reload}>Reintentar</button></div>}
      <div aria-busy={loading} className={loading ? "opacity-60" : ""}>
        <RecordingList folders={folders} recordings={data.recordings} total={data.total} onChanged={reload} emptyMessage={q || patientFilter || folderFilter ? "No hay grabaciones para esta búsqueda." : "Las grabaciones guardadas aparecerán aquí. Las vinculadas a pacientes también aparecerán en su ficha."} />
      </div>
      {data.total > data.pageSize && <nav aria-label="Páginas de grabaciones" className="flex items-center justify-between gap-3 text-sm">
        <button className="btn btn-ghost" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>Anterior</button>
        <span>Página {data.page} de {Math.ceil(data.total / data.pageSize)}</span>
        <button className="btn btn-ghost" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>Siguiente</button>
      </nav>}
    </section>
  </main>;
}
