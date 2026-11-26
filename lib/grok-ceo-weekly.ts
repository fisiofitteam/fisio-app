import { z } from "zod";
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !dayPattern.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
export function offsetDay(day: string, offset: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+offset);
  return date.toISOString().slice(0,10);
}
export function mondayForDay(day:string) {
  const d = new Date(day+"T12:00:00Z");
  return offsetDay(day,-((d.getUTCDay()+6)%7));
}
export function weeklyAnchor(today:string, requested:unknown) {
  const latest = mondayForDay(today);
  return validDay(requested) && requested === mondayForDay(requested) && requested <= latest ? requested : latest;
}
const short = z.string().trim().min(1).max(700);
const items = z.array(short).max(5);
export const weeklyStrategySchema = z.object({summary:z.string().trim().min(1).max(1800),risks:items,focus:items.max(3),nextActions:items.max(3),decisions:items.max(3)}).strict();
export function parseRecord(value:string): Record<string,unknown> | null {
  try {const v=JSON.parse(value); return v && typeof v==="object" && !Array.isArray(v) ? v : null;}catch{return null;}
}
export function metricValue(snapshot:unknown,path:string):number|null {
  let node:unknown=snapshot;
  for (const key of path.split(".")) {
    if (!node || typeof node!=="object") return null;
    node=(node as Record<string,unknown>)[key];
  }
  return typeof node==="number" && Number.isFinite(node) ? node : null;
}
export function stringList(value:unknown):string[] {
  return Array.isArray(value)?value.filter((x):x is string=>typeof x==="string").slice(0,10):[];
}
