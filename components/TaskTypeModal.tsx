"use client";

const TYPES = [
  { id: "WORKOUT", label: "Workout", icon: "🏋️", desc: "Sesión de entrenamiento con texto libre + vídeos de referencia" },
  { id: "VIDEO", label: "Vídeo / Mini-clase", icon: "🎥", desc: "Una pieza de vídeo educativa o explicativa" },
  { id: "FORM", label: "Formulario", icon: "📝", desc: "Preguntas configurables para el paciente" },
  { id: "EVOLUTION", label: "Registrar evolución", icon: "📊", desc: "RPE + dolor + rigidez + notas" },
];

export function TaskTypeModal({
  onSelect,
  onClose,
}: {
  onSelect: (type: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-neutral-200 flex justify-between items-center">
          <h3 className="font-medium">Añadir nueva tarea</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="w-full text-left p-3 border border-neutral-200 rounded-lg hover:border-neutral-900 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{t.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{t.label}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{t.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
