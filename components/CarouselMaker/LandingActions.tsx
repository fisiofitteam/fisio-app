"use client";

import Link from "next/link";
import { useState } from "react";
import { GenerateModal } from "./GenerateModal";

/**
 * Cards de acciones del landing del Carrusel Maker: biblioteca (link),
 * generar con IA (abre modal) y editor visual (Fase C, disabled).
 */
export function LandingActions({ libraryCount }: { libraryCount: number }) {
  const [generateOpen, setGenerateOpen] = useState(false);

  return (
    <>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Link
          href="/fisio/contenido/carrusel-maker/biblioteca"
          className="card !p-4 hover:border-neutral-400 transition-colors"
        >
          <div className="text-2xl mb-1">📚</div>
          <div className="font-medium text-sm">Biblioteca ({libraryCount})</div>
          <p className="text-xs text-neutral-500 mt-1">
            Añade y edita tus carruseles publicados. La IA los usa como referencia.
          </p>
        </Link>

        <button
          onClick={() => setGenerateOpen(true)}
          disabled={libraryCount === 0}
          className="card !p-4 hover:border-neutral-400 transition-colors text-left disabled:opacity-60 disabled:hover:border-neutral-200 disabled:cursor-not-allowed"
        >
          <div className="text-2xl mb-1">✨</div>
          <div className="font-medium text-sm">Generar con IA</div>
          <p className="text-xs text-neutral-500 mt-1">
            {libraryCount === 0
              ? "Necesitas al menos 1 carrusel en la biblioteca."
              : "Escribe un brief y deja que la IA replique tu tono."}
          </p>
        </button>

        <div className="card !p-4 text-neutral-600">
          <div className="text-2xl mb-1">🎨</div>
          <div className="font-medium text-sm">Editor visual</div>
          <p className="text-xs text-neutral-500 mt-1">
            Se abre desde cada draft. Canvas 1080×1350, plantilla FisioFit Cross, export ZIP.
          </p>
        </div>
      </section>

      {generateOpen && (
        <GenerateModal
          libraryReady={libraryCount > 0}
          onClose={() => setGenerateOpen(false)}
        />
      )}
    </>
  );
}
