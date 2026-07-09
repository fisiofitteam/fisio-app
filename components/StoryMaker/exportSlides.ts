"use client";

/**
 * Utilidades para exportar los slides como PNG a 1080×1920.
 *
 * html-to-image genera un dataURL desde un nodo DOM; los nodos que
 * renderizamos con SlideRenderer están a scale(0.32) para el preview,
 * pero el contenido interno tiene tamaño real. `toPng` respeta el
 * transform y sale a la resolución nativa de Instagram — perfecto.
 */
import { toPng } from "html-to-image";
import JSZip from "jszip";

// Extrae el dataURL PNG de un contenedor de SlideRenderer.
export async function slideToPng(el: HTMLElement): Promise<string> {
  return toPng(el, {
    width: 1080,
    height: 1920,
    pixelRatio: 1,
    cacheBust: true,
    style: {
      // Anular el scale del preview para exportar a tamaño real.
      transform: "none",
    },
  });
}

export async function downloadSlide(el: HTMLElement, index: number) {
  const dataUrl = await slideToPng(el);
  const link = document.createElement("a");
  link.download = `story-${String(index + 1).padStart(2, "0")}.png`;
  link.href = dataUrl;
  link.click();
}

export async function downloadZip(nodes: HTMLElement[], filename = "stories.zip") {
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i++) {
    const dataUrl = await slideToPng(nodes[i]);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    zip.file(`story-${String(i + 1).padStart(2, "0")}.png`, base64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
