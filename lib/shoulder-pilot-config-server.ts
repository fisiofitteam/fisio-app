import { prisma } from "@/lib/prisma";
import { DEFAULT_PILOT_CONFIG, validatePilotConfig, type PilotConfig } from "@/lib/shoulder-pilot";

export async function getPilotConfigRecord(): Promise<{revision:number;config:PilotConfig}> {
  const last = await prisma.shoulderPilotRubricRevision.findFirst({orderBy:{revision:"desc"}, select:{revision:true,config:true}});
  return last ? { revision:last.revision, config:validatePilotConfig(JSON.parse(last.config)) } : {revision:0,config:{...DEFAULT_PILOT_CONFIG}};
}
export async function getCurrentPilotConfig(): Promise<PilotConfig> {
  return (await getPilotConfigRecord()).config;
}
