/**
 * Banner azul claro en la parte superior de todas las páginas del paciente
 * mientras tenga una pausa activa. El paciente sigue teniendo acceso
 * normal a la app — el banner solo informa. Antes bloqueábamos con
 * PatientHomePaused, pero muchas veces les damos trabajo sustitutivo
 * durante la pausa (vacaciones activas, adaptaciones por lesión, etc).
 */

function formatShort(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

export function ActivePauseBanner({
  startDate,
  endDate,
  daysExtended,
}: {
  startDate: string;
  endDate: string;
  /** Días que se le alarga el programa por esta pausa (múltiplo de 7). */
  daysExtended: number;
}) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return (
    <div
      className="mx-auto max-w-md px-5 pt-4"
      style={{ color: "#0C4A6E" }}
    >
      <div
        className="rounded-2xl p-3 flex items-start gap-3"
        style={{
          background: "#E0F2FE",
          border: "1px solid #7DD3FC",
        }}
      >
        <div className="text-lg leading-none">⏸️</div>
        <div className="flex-1 min-w-0 text-sm leading-snug">
          <p className="font-semibold mb-0.5">Tu programa está pausado</p>
          <p className="text-xs" style={{ color: "#0369A1" }}>
            Del <strong>{formatShort(start)}</strong> al <strong>{formatShort(end)}</strong>.
            Te dejaremos trabajo sustitutivo para que no pierdas progreso, pero además te
            alargamos <strong>{daysExtended} días</strong> el programa.
          </p>
        </div>
      </div>
    </div>
  );
}
