export type WodReadiness = "RED" | "AMBER" | "GREEN";

export const WOD_READINESS_OPTIONS: ReadonlyArray<{value:WodReadiness;label:string;description:string}> = [
  {value:"RED",label:"Rojo",description:"Estoy peor que habitualmente. Tengo más dolor, rigidez, fatiga o tengo un contexto desfavorable (más estrés, peor sueño...)"},
  {value:"AMBER",label:"Ámbar",description:"Me mantengo estable. Mi dolor está en rangos normales, no noto excesiva fatiga o rigidez y mi contexto es el de siempre."},
  {value:"GREEN",label:"Verde",description:"Hoy tengo un buen día! Me duele menos y me noto más descansado y menos rígido."},
];
export const isWodReadiness = (value:unknown):value is WodReadiness =>
  value === "RED" || value === "AMBER" || value === "GREEN";
export const usesWodReadiness = (programType:string|null|undefined):boolean =>
  programType === "RECUPERA" || programType === "CONSOLIDA";

export type ReadinessLevelOverrides = {redCategoryLevelId?:string|null;greenCategoryLevelId?:string|null};
/** Neighbouring defined levels, including catalogues with gaps in their order. */
export function resolveReadinessLevel<T extends {id:string;order:number}>(
  baseLevelId:string|null|undefined,
  levels:readonly T[],
  readiness:WodReadiness,
  overrides:ReadinessLevelOverrides = {},
):T|null {
  const ordered=[...levels].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const baseIndex=ordered.findIndex(level=>level.id===baseLevelId);
  if(baseIndex<0)return null;
  const override=readiness==="RED"?overrides.redCategoryLevelId:readiness==="GREEN"?overrides.greenCategoryLevelId:null;
  const custom=override?ordered.find(level=>level.id===override):null;
  if(custom)return custom;
  const offset=readiness==="RED"?-1:readiness==="GREEN"?1:0;
  return ordered[Math.max(0,Math.min(ordered.length-1,baseIndex+offset))];
}
