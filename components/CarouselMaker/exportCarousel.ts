"use client";

import { toPng } from "html-to-image";
import JSZip from "jszip";
import { CANVAS_H, CANVAS_W } from "@/lib/carousel-maker/canvas";

/**
 * Convierte un nodo DOM que renderiza un slide (1080×1350) a un PNG en
 * data URL. Ignoramos cualquier transform CSS (el editor lo escala para
 * visualización) para capturar a resolución nativa.
 */
async function nodeToPng(el: HTMLElement): Promise<string> {
  return toPng(el, {
    width: CANVAS_W,
    height: CANVAS_H,
    pixelRatio: 1,
    cacheBust: true,
    style: { transform: "none" },
  });
}

export async function downloadSingleSlide(el: HTMLElement, index: number, baseName: string) {
  const dataUrl = await nodeToPng(el);
  const link = document.createElement("a");
  link.download = `${baseName}-${String(index + 1).padStart(2, "0")}.png`;
  link.href = dataUrl;
  link.click();
}

export async function downloadCarouselZip(nodes: HTMLElement[], baseName: string) {
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i++) {
    const dataUrl = await nodeToPng(nodes[i]);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    zip.file(`${baseName}-${String(i + 1).padStart(2, "0")}.png`, base64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${baseName}.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
}
