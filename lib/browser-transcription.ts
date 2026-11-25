/** Web Speech is optional: recognition failures must never stop screen capture. */
export type TranscriptStatus = "off" | "complete" | "partial" | "unavailable" | "edited";
export type TranscriptSnapshot = { text: string; interim: string; status: TranscriptStatus; listening: boolean; warning: string };
type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null; onend: (() => void) | null;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(audioTrack?: MediaStreamTrack): void; stop(): void; abort(): void;
};
type Constructor = new () => Recognition;
export function speechRecognitionConstructor(): Constructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: Constructor; webkitSpeechRecognition?: Constructor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}
// Older engines silently ignore start(track) and listen to the microphone instead.
// There is no side-effect-free feature probe: restrict this path to verified desktop Chromium versions.
export function supportsAudioTrackTranscription(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return false;
  const version = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  return !!version && Number(version[1]) >= 135;
}
export type BrowserTranscription = { pause(): void; resume(): void; markIncomplete(message: string): void; finish(): Promise<TranscriptSnapshot>; dispose(): void };
type TranscriptionSource = { audioTrack: MediaStreamTrack; supported: boolean };
export function startBrowserTranscription(onChange: (snapshot: TranscriptSnapshot) => void, factory = speechRecognitionConstructor(), source?: TranscriptionSource): BrowserTranscription {
  let current: Recognition | undefined, finals = new Map<number, string>(), interim = "", base = "";
  let paused = false, ended = false, disposed = false, listening = false, hadIssue = false, fatal = false, failures = 0, warning = "";
  let timer: ReturnType<typeof setTimeout> | undefined, finishTimer: ReturnType<typeof setTimeout> | undefined;
  let finishPromise: Promise<TranscriptSnapshot> | undefined, resolveFinish: ((s: TranscriptSnapshot) => void) | undefined;
  const join = (...parts: string[]) => parts.map(p => p.trim()).filter(Boolean).join(" ").slice(0, 150000);
  const snapshot = (): TranscriptSnapshot => ({ text: join(base, ...finals.values()), interim, listening,
    status: fatal && !join(base, ...finals.values()) ? "unavailable" : hadIssue ? "partial" : "complete", warning });
  function emit() { if (!disposed) onChange(snapshot()); }
  function commit(includeInterim = false) {
    base = join(base, ...finals.values(), includeInterim ? interim : ""); finals.clear(); interim = "";
  }
  function settle() {
    if (finishTimer) clearTimeout(finishTimer);
    listening = false; emit(); resolveFinish?.(snapshot()); resolveFinish = undefined;
  }
  function fail(message: string) { hadIssue = true; fatal = true; listening = false; warning = message; emit(); }
  function begin() {
    if (paused || ended || disposed || fatal || current) return;
    if (source && (!source.supported || source.audioTrack.kind !== "audio" || source.audioTrack.readyState !== "live")) {
      fail("No se puede transcribir el audio compartido en este navegador. El sonido sigue incluido en el vídeo; usa Chrome o Edge actualizado para transcribirlo."); return;
    }
    if (!factory) { fail("Este navegador no admite transcripción. El vídeo se puede grabar igualmente."); return; }
    let r: Recognition;
    try { r = new factory(); } catch { fail("No se ha podido activar el reconocimiento de voz. El vídeo sigue grabándose."); return; }
    current = r; finals.clear(); interim = "";
    r.lang = "es-ES"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onstart = () => { if (current === r && !disposed) { listening = true; emit(); } };
    r.onresult = event => {
      if (current !== r || disposed) return;
      const nextInterim: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i], text = result[0]?.transcript || "";
        if (result.isFinal) { finals.set(i, text); failures = 0; } else nextInterim.push(text);
      }
      interim = nextInterim.join(" "); emit();
    };
    r.onerror = event => {
      if (current !== r || disposed || (event.error === "aborted" && (paused || ended))) return;
      if (event.error === "no-speech") return;
      hadIssue = true;
      warning = "La transcripción se ha interrumpido; puede faltar parte del texto. El vídeo sigue grabándose.";
      if (["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(event.error)) {
        fatal = true; warning = source
          ? "No se ha podido transcribir el audio compartido. Comprueba el reconocimiento de voz del navegador; el vídeo sigue grabándose."
          : "No se ha podido activar la transcripción. Comprueba el permiso del micrófono y el reconocimiento de voz del navegador.";
      } else if (++failures >= 3) fatal = true;
      listening = false; emit();
      if (fatal) { try { r.abort(); } catch {} }
    };
    r.onend = () => {
      if (current !== r || disposed) return;
      if (interim.trim()) { hadIssue = true; warning ||= "Puede faltar el final de una frase. Revisa el texto antes de guardarlo."; }
      commit(!!interim.trim()); current = undefined; listening = false; emit();
      if (ended) settle();
      else if (!paused && !fatal) timer = setTimeout(begin, failures ? 1500 : 250);
    };
    try { if (source) r.start(source.audioTrack); else r.start(); }
    catch { current = undefined; try { r.abort(); } catch {} fail("No se ha podido iniciar la transcripción. El vídeo sigue grabándose."); }
  }
  begin();
  return {
    pause() { paused = true; if (timer) clearTimeout(timer); listening = false; try { current?.stop(); } catch {} emit(); },
    resume() { if (ended || disposed) return; paused = false; if (!current) begin(); },
    markIncomplete(message) { if (ended || disposed) return; hadIssue = true; warning = message; emit(); },
    finish() {
      if (finishPromise) return finishPromise;
      ended = true; if (timer) clearTimeout(timer);
      finishPromise = new Promise(resolve => { resolveFinish = resolve; });
      if (!current) settle();
      else {
        const r = current;
        finishTimer = setTimeout(() => {
          if (current === r) {
            if (interim.trim()) { hadIssue = true; warning ||= "Revisa el final de la transcripción."; }
            commit(!!interim.trim()); current = undefined; try { r.abort(); } catch {}
          }
          settle();
        }, 1800);
        try { r.stop(); } catch { current = undefined; commit(!!interim.trim()); settle(); }
      }
      return finishPromise;
    },
    dispose() {
      disposed = true; ended = true;
      if (timer) clearTimeout(timer); if (finishTimer) clearTimeout(finishTimer);
      const r = current; current = undefined; commit(!!interim.trim()); try { r?.abort(); } catch {}
      resolveFinish?.(snapshot()); resolveFinish = undefined;
    },
  };
}
