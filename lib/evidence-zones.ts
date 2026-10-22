export const EVIDENCE_ZONES = [
  { value: "hombro", label: "Hombro" },
  { value: "lumbar", label: "Lumbar" },
  { value: "rodilla", label: "Rodilla" },
  { value: "otro", label: "Otro" },
] as const;
export function validEvidenceZone(value: unknown): value is string | null {
  return value === null || EVIDENCE_ZONES.some(zone => zone.value === value);
}
