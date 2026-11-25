export type AudioInputState = { state: "off" | "live" | "muted" | "ended"; level: number };
export type RecordingAudioState = { microphone: AudioInputState; shared: AudioInputState };

/** One output for recording and speech recognition; never routed to the speakers. */
export async function mixRecordingAudio(microphone: MediaStreamTrack[], shared: MediaStreamTrack[]) {
  const context = new AudioContext();
  try {
    await context.resume();
    const destination = context.createMediaStreamDestination();
    const inputs = [microphone, shared].map(tracks => tracks.map(track => {
      const source = context.createMediaStreamSource(new MediaStream([track]));
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      source.connect(analyser); analyser.connect(destination);
      return { track, source, analyser, samples: new Uint8Array(analyser.fftSize) };
    }));
    const read = (group: typeof inputs[number]): AudioInputState => {
      if (!group.length) return { state: "off", level: 0 };
      const live = group.filter(input => input.track.readyState === "live");
      if (!live.length) return { state: "ended", level: 0 };
      const audible = live.filter(input => input.track.enabled && !input.track.muted);
      if (!audible.length || context.state !== "running") return { state: "muted", level: 0 };
      let level = 0;
      for (const input of audible) {
        input.analyser.getByteTimeDomainData(input.samples);
        const power = input.samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / input.samples.length;
        level = Math.max(level, Math.min(1, Math.sqrt(power) * 4));
      }
      return { state: "live", level };
    };
    let closed = false;
    return {
      stream: destination.stream,
      snapshot: (): RecordingAudioState => ({ microphone: read(inputs[0]), shared: read(inputs[1]) }),
      close() {
        if (closed) return; closed = true;
        inputs.flat().forEach(({ source, analyser }) => { source.disconnect(); analyser.disconnect(); });
        destination.stream.getTracks().forEach(track => track.stop());
        void context.close().catch(() => {});
      },
    };
  } catch (error) { void context.close().catch(() => {}); throw error; }
}
