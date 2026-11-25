const $ = id => document.getElementById(id);
let starting = false, phase = "idle", preview, draftSignature = "", polling = false, previewStarting = false;
async function send(message) {
  const response = await chrome.runtime.sendMessage({ target: "worker", ...message });
  if (response?.error) throw Error(response.error); return response;
}
function message(text) { $("message").textContent = text || ""; $("message").hidden = !text; }
function mode(call) { $("system").checked = call; $("microphone").checked = true; updateOptions(); }
function updateOptions() {
  const system = $("system").checked;
  $("call").setAttribute("aria-pressed", String(system)); $("explanation").setAttribute("aria-pressed", String(!system)); $("audio-help").hidden = !system;
  $("transcribe").disabled = !system && !$("microphone").checked;
}
$("call").onclick = () => mode(true); $("explanation").onclick = () => mode(false);
$("system").onchange = updateOptions; $("microphone").onchange = updateOptions;
function stopPreview() { preview?.getTracks().forEach(track => track.stop()); preview = undefined; $("camera-preview").srcObject = null; $("camera-preview").hidden = true; $("camera-float").hidden = true; }
async function previewCamera() {
  if (preview || previewStarting) return; previewStarting = true;
  try { preview = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); $("camera-preview").srcObject = preview; $("camera-preview").hidden = false; $("camera-float").hidden = !document.pictureInPictureEnabled; }
  catch { message("La grabación sigue. No se ha podido abrir la vista previa de cámara en este panel."); }
  finally { previewStarting = false; }
}
$("camera-float").onclick = async () => { try { await $("camera-preview").requestPictureInPicture(); } catch { message("No se ha podido abrir la cámara flotante."); } };
$("start").onclick = async () => {
  if (starting) return; starting = true; $("start").disabled = true; message("");
  const options = { camera: $("camera").checked, microphone: $("microphone").checked, systemAudio: $("system").checked, transcribe: $("transcribe").checked && !$("transcribe").disabled };
  try {
    await send({ type: "prepare" });
    // Permissions must be requested from a visible extension page, never a hidden document.
    if (options.camera || options.microphone) {
      const permission = await navigator.mediaDevices.getUserMedia({ video: options.camera, audio: options.microphone });
      permission.getTracks().forEach(track => track.stop());
    }
    const selected = await new Promise(resolve => chrome.desktopCapture.chooseDesktopMedia(options.systemAudio ? ["tab", "window", "screen", "audio"] : ["tab", "window", "screen"], (streamId, data) => resolve({ streamId, canRequestAudioTrack: !!data?.canRequestAudioTrack })));
    if (!selected.streamId) { message("No se ha iniciado la grabación."); return; }
    await send({ type: "start", ...selected, ...options });
    if (options.camera) await previewCamera();
  } catch (error) { message(error.message); stopPreview(); }
  finally { starting = false; $("start").disabled = false; void refresh(); }
};
$("pause").onclick = () => send({ type: phase === "paused" ? "resume" : "pause" }).then(refresh).catch(error => message(error.message));
$("stop").onclick = () => send({ type: "stop" }).then(refresh).catch(error => message(error.message));
function button(text, action, className = "") { const el = document.createElement("button"); el.textContent = text; el.className = className; el.onclick = async () => { el.disabled = true; try { await action(); } catch (error) { message(error.message); } finally { el.disabled = false; void refresh(); } }; return el; }
async function refresh() {
  if (polling) return; polling = true;
  try {
    const next = await send({ type: "status" }); phase = next.phase;
    const active = ["preparing", "recording", "paused", "stopping"].includes(phase);
    $("setup").hidden = active; $("live").hidden = !active;
    $("badge").textContent = phase === "recording" ? "● REC" : phase === "paused" ? "PAUSA" : phase === "stopping" ? "GUARDANDO" : "LISTO";
    $("clock").textContent = String(Math.floor((next.elapsed || 0) / 60)).padStart(2,"0") + ":" + String((next.elapsed || 0) % 60).padStart(2,"0");
    $("pause").textContent = phase === "paused" ? "Reanudar" : "Pausar";
    $("pause").disabled = $("stop").disabled = !["recording","paused"].includes(phase);
    $("transcript").textContent = next.transcript || "Esperando voz…";
    const warnings = [next.speechWarning, next.storageWarning, next.reason].filter(Boolean);
    $("warning").textContent = warnings.join(" "); $("warning").hidden = !warnings.length;
    if (next.error) message(next.error);
    if (!active) stopPreview();
    else if (next.camera && ["recording", "paused"].includes(phase)) void previewCamera();
    $("meters").replaceChildren();
    for (const [key,label] of [["microphone","Tu micrófono"],["shared","Cliente / ordenador"]]) {
      const input = next.audio?.[key]; if (!input || input.state === "off") continue;
      const text = input.state === "ended" ? "Desconectado: vuelve a grabar" : phase === "paused" ? "En pausa" : input.state === "muted" ? "Audio no disponible" : input.level > .02 ? "Recibiendo sonido" : "Esperando sonido";
      const row = document.createElement("div"); row.className = "input-meter";
      const name = document.createElement("label"); const status = document.createElement("span"); name.textContent = label; status.textContent = text; name.append(status);
      const meter = document.createElement("meter"); meter.max = 100; meter.value = phase === "paused" ? 0 : input.level * 100; meter.setAttribute("aria-label", label); row.append(name,meter); $("meters").append(row);
    }
    $("pending").hidden = !next.drafts.length;
    const signature = JSON.stringify(next.drafts);
    if (signature !== draftSignature) {
      draftSignature = signature; $("drafts").replaceChildren();
      for (const draft of next.drafts.sort((a,b)=>b.createdAt-a.createdAt)) {
        const row = document.createElement("div"); row.className = "draft";
        const title = document.createElement("p"); title.textContent = draft.title + " · " + (draft.size / 1024 / 1024).toFixed(1) + " MB";
        const actions = document.createElement("div"); actions.className = "actions";
        actions.append(button("Guardar en FisioFit", () => send({ type:"export", id:draft.id }), "primary"), button("Descargar", async () => {
          const file = await send({ type:"download", id:draft.id }); const a = document.createElement("a"); a.href=file.url; a.download=file.filename; a.click();
        }), button("Descartar", async () => { if (confirm("¿Eliminar esta copia local?")) await send({ type:"delete", id:draft.id }); }, "danger"));
        row.append(title,actions); $("drafts").append(row);
      }
    }
  } catch (error) { message(error.message); } finally { polling = false; }
}
window.addEventListener("pagehide", stopPreview);
updateOptions(); void refresh(); setInterval(refresh, 1000);
