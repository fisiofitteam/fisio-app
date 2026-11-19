import { MAX_RECORDING_BYTES, MAX_RECORDING_SECONDS } from "./recording-rules";
export type FinishedRecording = { blob: Blob; durationSeconds: number; reason?: string };
export type BrowserRecording = { stop(): void; pause(): void; resume(): void };
type Options = { camera: boolean; microphone: boolean; systemAudio: boolean; onFinish(result: FinishedRecording): void; onError(message: string): void; onTick(seconds: number): void };
export function supportedRecordingMime(isSupported: (mime: string) => boolean) {
  return ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(isSupported);
}
export async function startBrowserRecording(options: Options): Promise<BrowserRecording> {
  if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") throw new Error("Abre el grabador en Chrome o Edge desde un ordenador.");
  const streams: MediaStream[] = [];
  const videos: HTMLVideoElement[] = [];
  let context: AudioContext | undefined, worker: Worker | undefined, workerUrl: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined, stopTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false, recorder: MediaRecorder | undefined;
  let chunks: Blob[] = [], bytes = 0, elapsedMs = 0, resumedAt = performance.now(), paused = false, reason: string | undefined;
  function clean() {
    if (timer) clearInterval(timer);
    if (stopTimer) clearTimeout(stopTimer);
    worker?.terminate(); if (workerUrl) URL.revokeObjectURL(workerUrl);
    streams.forEach(s => s.getTracks().forEach(t => { t.onended = null; t.stop(); }));
    videos.forEach(v => { v.pause(); v.srcObject = null; v.remove(); });
    void context?.close().catch(() => {});
  }
  function seconds() { return (elapsedMs + (paused || stopped ? 0 : performance.now() - resumedAt)) / 1000; }
  function stop() {
    if (stopped) return;
    if (!paused) elapsedMs += performance.now() - resumedAt;
    stopped = true;
    if (timer) clearInterval(timer);
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      stopTimer = setTimeout(() => { clean(); options.onError("El navegador no pudo finalizar la grabación."); }, 15000);
    }
  }
  try {
    // Called before any unrelated await so the browser retains the user's gesture.
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 24, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: options.systemAudio });
    streams.push(screen);
    const screenTrack = screen.getVideoTracks()[0];
    if (!screenTrack) throw new Error("No se ha seleccionado ninguna pantalla.");
    let devices: MediaStream | undefined;
    if (options.camera || options.microphone) {
      devices = await navigator.mediaDevices.getUserMedia({
        video: options.camera ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } : false,
        audio: options.microphone ? { echoCancellation: true, noiseSuppression: true } : false,
      });
      streams.push(devices);
    }
    if (screenTrack.readyState !== "live") throw new Error("Se ha detenido el uso compartido de pantalla.");
    let videoTrack = screenTrack;
    if (options.camera && devices?.getVideoTracks().length) {
      const makeVideo = async (stream: MediaStream) => {
        const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = stream;
        videos.push(v); await v.play(); return v;
      };
      const screenVideo = await makeVideo(screen), cameraVideo = await makeVideo(new MediaStream(devices.getVideoTracks()));
      const canvas = document.createElement("canvas");
      const settings = screenTrack.getSettings(), aspect = (settings.width || 1920) / (settings.height || 1080);
      canvas.width = Math.round(Math.min(settings.width || 1280, 1280) / 2) * 2;
      canvas.height = Math.round(canvas.width / aspect / 2) * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se puede combinar la cámara y la pantalla.");
      const draw = () => {
        ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        const radius = Math.min(canvas.width, canvas.height) * .14, x = canvas.width - radius - 24, y = canvas.height - radius - 24;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
        const size = Math.min(cameraVideo.videoWidth || 640, cameraVideo.videoHeight || 480);
        ctx.drawImage(cameraVideo, ((cameraVideo.videoWidth || 640) - size) / 2, ((cameraVideo.videoHeight || 480) - size) / 2, size, size, x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      };
      draw();
      // Worker ticks continue when the professional switches to WhatsApp or another tab.
      workerUrl = URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 42)"], { type: "text/javascript" }));
      worker = new Worker(workerUrl); worker.onmessage = draw;
      const composite = canvas.captureStream(24); streams.push(composite); videoTrack = composite.getVideoTracks()[0];
    }
    const tracks: MediaStreamTrack[] = [videoTrack];
    const audioTracks = [...screen.getAudioTracks(), ...(devices?.getAudioTracks() || [])];
    if (audioTracks.length) {
      context = new AudioContext(); await context.resume();
      const dest = context.createMediaStreamDestination();
      audioTracks.forEach(t => context!.createMediaStreamSource(new MediaStream([t])).connect(dest));
      streams.push(dest.stream); tracks.push(...dest.stream.getAudioTracks());
    }
    const mime = supportedRecordingMime(m => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error("Este navegador no ofrece un formato de grabación compatible.");
    recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 2000000, audioBitsPerSecond: 128000 });
    recorder.ondataavailable = event => {
      if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
      if (bytes > MAX_RECORDING_BYTES - 2 * 1024 * 1024 && !stopped) { reason = "La grabación ha alcanzado el límite de 500 MB."; stop(); }
    };
    recorder.onerror = () => { reason = "El navegador interrumpió la grabación. Revisa el vídeo recuperado."; stop(); };
    recorder.onstop = () => {
      if (!stopped) { if (!paused) elapsedMs += performance.now() - resumedAt; stopped = true; reason = "Se ha detenido la captura de pantalla."; }
      const durationSeconds = seconds();
      const blob = new Blob(chunks, { type: recorder!.mimeType.split(";")[0] });
      chunks = []; clean();
      if (!blob.size) options.onError("La grabación está vacía. Vuelve a intentarlo.");
      else options.onFinish({ blob, durationSeconds, reason });
    };
    screenTrack.onended = () => { reason = "Has dejado de compartir la pantalla."; stop(); };
    recorder.start(1000); resumedAt = performance.now();
    timer = setInterval(() => {
      const time = seconds(); options.onTick(Math.floor(time));
      if (time >= MAX_RECORDING_SECONDS) { reason = "Se ha alcanzado el límite de 30 minutos."; stop(); }
    }, 500);
    return {
      stop,
      pause() { if (!stopped && !paused && recorder?.state === "recording") { elapsedMs += performance.now() - resumedAt; paused = true; recorder.pause(); } },
      resume() { if (!stopped && paused && recorder?.state === "paused") { resumedAt = performance.now(); paused = false; recorder.resume(); } },
    };
  } catch (e) { clean(); throw e; }
}
