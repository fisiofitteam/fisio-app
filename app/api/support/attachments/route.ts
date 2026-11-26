import { supportActor, supportBody, supportRoute } from "@/lib/support/http";
import { reserveSupportFileSchema } from "@/lib/support/materials-contract";
import { reserveSupportFile } from "@/lib/support/materials";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return supportRoute(async () => reserveSupportFile(await supportActor(), await supportBody(req, reserveSupportFileSchema)));
}
