"use client";

/**
 * Utilidades para exportar los slides como PNG / PDF.
 *
 * html-to-image genera un dataURL desde un nodo DOM. El editor renderiza
 * cada slide dos veces: en preview (scale<1) y en un contenedor oculto a
 * tamaño real (scale=1). Aquí capturamos siempre del contenedor oculto.
 *
 * V2: acepta el formato para dimensionar correctamente (9:16 o 4:5) y
 * añade export PDF con jsPDF.
 */
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { FORMAT_DIMS, type StoryFormat } from "./types";

// Extrae el dataURL PNG de un contenedor de SlideRenderer al tamaño real
// del formato indicado.
export async function slideToPng(el: HTMLElement, format: StoryFormat): Promise<string> {
  const { w, h } = FORMAT_DIMS[format];
  return toPng(el, {
    width: w,
    height: h,
    pixelRatio: 1,
    cacheBust: true,
    style: { transform: "none" },
  });
}

function fileBase(format: StoryFormat): string {
  return format === "carousel-4x5" ? "carrusel" : "story";
}

export async function downloadSlide(el: HTMLElement, index: number, format: StoryFormat) {
  const dataUrl = await slideToPng(el, format);
  const link = document.createElement("a");
  link.download = `${fileBase(format)}-${String(index + 1).padStart(2, "0")}.png`;
  link.href = dataUrl;
  link.click();
}

export async function downloadZip(nodes: HTMLElement[], format: StoryFormat) {
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i++) {
    const dataUrl = await slideToPng(nodes[i], format);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    zip.file(`${fileBase(format)}-${String(i + 1).padStart(2, "0")}.png`, base64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${fileBase(format)}s.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Export PDF: una página por slide con las dimensiones del formato.
 * jsPDF crea el PDF a partir de los dataURL PNG. La escala 1px = 1pt
 * es correcta para vistas — no es print quality pero sirve para revisar
 * la serie completa en un vistazo compartible por WhatsApp.
 */
export async function downloadPdf(nodes: HTMLElement[], format: StoryFormat) {
  const { w, h } = FORMAT_DIMS[format];
  // Dinámico para no pesar en bundle si nadie exporta PDF.
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: h > w ? "portrait" : "landscape",
    unit: "px",
    format: [w, h],
    hotfixes: ["px_scaling"],
  });
  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) pdf.addPage([w, h], h > w ? "portrait" : "landscape");
    const dataUrl = await slideToPng(nodes[i], format);
    pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
  }
  pdf.save(`${fileBase(format)}s.pdf`);
}
