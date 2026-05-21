"use client";

import { useEffect, useState } from "react";
import { WorkoutTaskEditor } from "./tasks/WorkoutTaskEditor";
import { VideoTaskEditor } from "./tasks/VideoTaskEditor";
import { FormTaskEditor } from "./tasks/FormTaskEditor";
import { EvolutionTaskEditor } from "./tasks/EvolutionTaskEditor";

export function TaskEditorModal({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const [task, setTask] = useState<any | null>(null);

  useEffect(() => {
    fetch(`/api/programs/tasks?id=${taskId}`)
      .then((r) => r.json())
      .then(setTask);
  }, [taskId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {!task ? (
          <div className="p-8 text-center text-sm text-neutral-500">Cargando...</div>
        ) : (
          <>
            <div className="p-4 border-b border-neutral-200 flex justify-between items-center sticky top-0 bg-white">
              <h3 className="font-medium">Editar tarea</h3>
              <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
            </div>

            <div className="p-4">
              {task.type === "WORKOUT" && <WorkoutTaskEditor task={task} onClose={onClose} />}
              {task.type === "VIDEO" && <VideoTaskEditor task={task} onClose={onClose} />}
              {task.type === "FORM" && <FormTaskEditor task={task} onClose={onClose} />}
              {task.type === "EVOLUTION" && <EvolutionTaskEditor task={task} onClose={onClose} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
