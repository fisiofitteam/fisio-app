import type { RecordingAudioState } from "@/lib/recording-audio";

export function RecordingAudioMeter({ state, paused }: { state: RecordingAudioState; paused: boolean }) {
  return <div className="mt-3 space-y-2" aria-label="Fuentes de audio">
    {(["microphone", "shared"] as const).map(key => {
      const input = state[key]; if (input.state === "off") return null;
      const label = key === "microphone" ? "Tu micrófono" : "Cliente / ordenador";
      const lost = input.state === "ended", muted = input.state === "muted";
      const status = lost ? "Desconectado" : paused ? "En pausa" : muted ? "Audio no disponible" : input.level > .02 ? "Recibiendo sonido" : "Esperando sonido";
      const level = paused || lost || muted ? 0 : Math.round(input.level * 100);
      return <div key={key} className="text-xs">
        <div className="flex flex-wrap justify-between gap-x-3"><span>{label}</span><span className={lost || muted ? "text-amber-700" : "text-neutral-500"}>{status}</span></div>
        <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={level} aria-valuetext={status} className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-150" style={{ width: level + "%" }} />
        </div>
        {lost && <p role="status" className="mt-1 text-amber-700">Se ha perdido esta fuente. Termina y vuelve a iniciar la grabación para recuperarla.</p>}
        {muted && !paused && <p role="status" className="mt-1 text-amber-700">Comprueba el audio y el permiso de compartir del navegador.</p>}
      </div>;
    })}
  </div>;
}
