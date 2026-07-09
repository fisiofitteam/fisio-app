"use client";

import { toPng } from "html-to-image";
import JSZip from "jszip";
import { CANVAS_H, CANVAS_W } from "@/lib/story-maker/types";

/**
 * html-to-image captura desde un contenedor DOM. Nosotros renderizamos los
 * slides "reales" (scale=1) en un contenedor oculto y desde ahí capturamos.
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

export async function downloadSlide(el: HTMLElement, index: number) {
  const dataUrl = await nodeToPng(el);
  const link = document.createElement("a");
  link.download = `story-${String(index + 1).padStart(2, "0")}.png`;
  link.href = dataUrl;
  link.click();
}

export async function downloadZip(nodes: HTMLElement[]) {
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i++) {
    const dataUrl = await nodeToPng(nodes[i]);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    zip.file(`story-${String(i + 1).padStart(2, "0")}.png`, base64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = "stories.zip";
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
