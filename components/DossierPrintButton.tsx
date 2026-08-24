"use client";

/**
 * Botón "Imprimir / PDF" del dossier. Usa window.print() — el navegador
 * ofrece "Guardar como PDF" en el diálogo, así que sirve tanto para papel
 * como para descargar. Los estilos print: de Tailwind ocultan el navegador
 * y ajustan saltos de página por semana.
 */
export function DossierPrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs font-medium px-3 py-2 rounded-lg"
      style={{ background: "#0A0A0A", color: "#FAFAFA" }}
    >
      🖨️ Imprimir / PDF
    </button>
  );
}
