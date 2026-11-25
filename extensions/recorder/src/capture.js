import { startBrowserRecording } from "../../../lib/browser-recorder.ts";
import { startBrowserTranscription, speechRecognitionConstructor, supportsAudioTrackTranscription } from "../../../lib/browser-transcription.ts";
import { records, metadata, chunk } from "./store.js";
import { CHUNK_SIZE, ACTIVE_PHASES, validChunk } from "./protocol.js";
let controller, speech, pending, downloadURL;
let state = { phase: "idle", elapsed: 0 }, transcript = { text: "", interim: "", status: "off", warning: "" }, audioLost = false;
function publish(update) {
  state = { ...state, ...update };
  void chrome.runtime.sendMessage({ target: "worker", type: "snapshot", state: { phase: state.phase } }).catch(() => {});
}
async function start(message) {
  if (ACTIVE_PHASES.includes(state.phase)) throw Error("Ya hay una grabación en curso.");
  if (pending && state.storageWarning) throw Error("Guarda o descarga la grabación pendiente antes de empezar otra.");
  const options = { camera: message.camera === true, microphone: message.microphone === true, systemAudio: message.systemAudio === true };
  if (typeof message.streamId !== "string" || !message.streamId) throw Error("Falta seleccionar qué quieres compartir.");
  if (options.systemAudio && !message.canRequestAudioTrack) throw Error("Activa «Compartir audio» al elegir la pestaña de la llamada, o desactiva el audio del cliente.");
  pending = undefined; audioLost = false; transcript = { text: "", interim: "", status: "off", warning: "" };
  publish({ phase: "preparing", elapsed: 0, camera: options.camera, audio: null, error: "", storageWarning: "", memoryDraft: null, transcript: "", speechWarning: "", reason: "" });
  try {
    controller = await startBrowserRecording({ ...options, frameWorkerUrl: chrome.runtime.getURL("frame-worker.js"),
      onTick: elapsed => { state.elapsed = elapsed; },
      onAudioState: audio => {
        state.audio = audio;
        if (!audioLost && (audio.microphone.state === "ended" || audio.shared.state === "ended")) {
          audioLost = true; speech?.markIncomplete("Se ha perdido una fuente de audio. Revisa la transcripción.");
        }
      },
      onError: error => { void speech?.finish(); speech?.dispose(); speech = undefined; controller = undefined; publish({ phase: "idle", error }); },
      onFinish: result => {
        controller = undefined; publish({ phase: "stopping" });
        void (async () => {
          if (speech) transcript = await speech.finish(); speech?.dispose(); speech = undefined;
          pending = { id: crypto.randomUUID(), ...result, title: "Grabación · " + new Date().toLocaleString("es-ES"), createdAt: Date.now(),
            transcript: transcript.text, transcriptionStatus: transcript.status, transcriptionWarning: transcript.warning };
          try { await records("put", pending); }
          catch { state.storageWarning = "No queda espacio para conservar la copia local. Guarda en FisioFit o descarga el vídeo antes de cerrar Chrome."; }
          publish({ phase: "preview", memoryDraft: { id: pending.id, title: pending.title, createdAt: pending.createdAt, size: pending.blob.size }, reason: result.reason || "", error: "" });
        })().catch(error => publish({ phase: "error", error: "No se pudo preparar el vídeo: " + error.message }));
      },
    }, () => navigator.mediaDevices.getUserMedia({
      video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: message.streamId } },
      audio: options.systemAudio ? { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: message.streamId } } : false,
    }));
    publish({ phase: "recording" });
    if (message.transcribe && controller.audioTrack) {
      speech = startBrowserTranscription(snapshot => {
        transcript = snapshot; state.transcript = (snapshot.text + " " + snapshot.interim).slice(-3000); state.speechWarning = snapshot.warning;
      }, speechRecognitionConstructor(), { audioTrack: controller.audioTrack, supported: supportsAudioTrackTranscription() });
    }
    return { ok: true };
  } catch (error) { publish({ phase: "idle", error: error.message }); throw error; }
}
async function handle(message) {
  if (message.type === "state") return state;
  if (message.type === "start") return start(message);
  if (message.type === "pause" && state.phase === "recording") { controller?.pause(); speech?.pause(); publish({ phase: "paused" }); }
  if (message.type === "resume" && state.phase === "paused") { controller?.resume(); speech?.resume(); publish({ phase: "recording" }); }
  if (message.type === "stop" && ["recording", "paused"].includes(state.phase)) { publish({ phase: "stopping" }); void speech?.finish(); controller?.stop(); }
  if (message.type === "metadata") return pending?.id === message.id ? metadata(pending) : null;
  if (message.type === "chunk") {
    if (pending?.id !== message.id || !validChunk(message.offset, pending.blob.size)) throw Error("Fragmento no disponible.");
    return chunk(pending, message.offset, CHUNK_SIZE);
  }
  if (message.type === "forget" && pending?.id === message.id) { pending = undefined; publish({ memoryDraft: null, storageWarning: "", phase: ACTIVE_PHASES.includes(state.phase) ? state.phase : "idle" }); }
  if (message.type === "download") {
    const item = pending?.id === message.id ? pending : await records("get", message.id);
    if (!item) throw Error("Grabación no disponible.");
    if (downloadURL) URL.revokeObjectURL(downloadURL);
    downloadURL = URL.createObjectURL(item.blob); return { url: downloadURL, filename: "fisiofit-grabacion." + (item.blob.type === "video/mp4" ? "mp4" : "webm") };
  }
  return { ok: true };
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== "capture" || sender.id !== chrome.runtime.id) return;
  handle(message).then(respond, error => respond({ error: error.message })); return true;
});
