"use client";
import { useEffect, useRef, type ReactNode } from "react";
export type WorkPerson = { id: string; fullName: string; role: string };
export function WorkDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
      className="rounded-2xl p-0 w-[min(720px,94vw)] max-h-[90vh] backdrop:bg-black/40"
    >
      <div className="p-5">
        <div className="flex justify-between items-center gap-3 mb-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="px-3 py-2"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
