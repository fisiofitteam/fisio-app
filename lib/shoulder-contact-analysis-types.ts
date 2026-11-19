// Internal comparison only: these observations never enter clinical scoring.
export const WALL_PRESS_TEST_ID = "5ab05c1c-5874-4c6e-ae18-16f981357338";
export const MAX_CONTACT_PROBE_JPEG_BYTES = 1_000_000; // Base64 characters, bounded before decoding.
export const MAX_CONTACT_PROBE_EDGE = 1920;
export type CropRegion = { x:number; y:number; width:number; height:number };
export type ContactProbeVariant = "mosaic" | "frame" | "crop";
export type ContactProbeApproach = "strict" | "spatial";
export type ContactProbeEffort = "medium" | "high";
export type ContactProbeInput = {
  mode:"contact-probe"; videoId:string; testId:string; uploadedAt:string;
  duration:number; time:number; variant:ContactProbeVariant; times:number[]; jpeg:string;
  approach?:ContactProbeApproach; effort?:ContactProbeEffort;
};
export type ContactProbeObservation = {
  status:"visible_contact" | "visible_gap" | "not_visible";
  reason:string;
};
export type ContactProbeResult = {
  model:string; time:number;
  approach?:ContactProbeApproach; effort?:ContactProbeEffort;
  leftImageArm:ContactProbeObservation; rightImageArm:ContactProbeObservation;
  limitations:string[];
};
