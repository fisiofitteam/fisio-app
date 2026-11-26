// Custom integration: only account information. No arbitrary URLs or banking writes.
import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const pontoAccount = z.object({ id, type: z.literal("account"), attributes: z.object({
  currency: z.string(), reference: z.string().nullish(), description: z.string().nullish(),
  currentBalance: z.number().finite().nullish(), availableBalance: z.number().finite().nullish(),
  currentBalanceReferenceDate: z.string().nullish(), availableBalanceReferenceDate: z.string().nullish(),
  authorizationExpirationExpectedAt: z.string().nullish(), deprecated: z.boolean().optional(),
}), meta: z.object({ synchronizedAt: z.string().nullish() }).optional() });
export const pontoTransaction = z.object({ id, type: z.literal("transaction"), attributes: z.object({
  currency: z.string(), amount: z.number().finite(), description: z.string().nullish(), counterpartName: z.string().nullish(),
  remittanceInformation: z.string().nullish(), executionDate: z.string(), valueDate: z.string().nullish(),
  digest: z.string().nullish(),
}) });
export type PontoTransaction = z.infer<typeof pontoTransaction>;
export class PontoError extends Error { constructor(public code: string) { super(code); } }
export function pontoConfiguration() {
  const accountIds = (process.env.PONTO_ACCOUNT_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const credentials = !!process.env.PONTO_CLIENT_ID && !!process.env.PONTO_CLIENT_SECRET;
  const accounts = accountIds.length > 0 && accountIds.length <= 5 && accountIds.every(x => id.safeParse(x).success);
  return { credentials, accounts, ready: credentials && accounts, accountIds: [...new Set(accountIds)] };
}
const ORIGIN = "https://api.myponto.com";
export class PontoClient {
  private token: string | null = null;
  private deadline = Date.now() + 180000;
  constructor(private clientId: string, private clientSecret: string, private request: typeof fetch = fetch) {}
  private async authenticate() {
    const res = await this.request(ORIGIN + "/oauth2/token", { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(this.clientId + ":" + this.clientSecret).toString("base64") },
      body: "grant_type=client_credentials" });
    if (!res.ok) throw new PontoError(res.status === 401 ? "credentials_invalid" : "ponto_unavailable");
    const data = z.object({ access_token: z.string().min(1), scope: z.string(), token_type: z.string() }).parse(await res.json());
    const scopes = data.scope.trim().split(/\s+/);
    // Fail closed even when credentials inadvertently include payment permission.
    if (scopes.length !== 1 || scopes[0] !== "ai" || data.token_type.toLowerCase() !== "bearer") throw new PontoError("ais_only_required");
    this.token = data.access_token;
  }
  private async get(path: string, retry = true): Promise<unknown> {
    if (Date.now() > this.deadline) throw new PontoError("pagination_incomplete");
    const url = new URL(path, ORIGIN);
    if (url.origin !== ORIGIN || !/^\/accounts(?:\/[a-zA-Z0-9_-]+(?:\/transactions)?)?$/.test(url.pathname) || url.username || url.password) throw new PontoError("invalid_endpoint");
    if (!this.token) await this.authenticate();
    const res = await this.request(url, { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Accept: "application/json", Authorization: "Bearer " + this.token } });
    if (res.status === 401 && retry) { this.token = null; return this.get(path, false); }
    if (!res.ok) throw new PontoError(res.status === 429 ? "rate_limited" : res.status === 403 ? "consent_required" : "ponto_unavailable");
    return res.json();
  }
  async accounts() {
    let path: string | null = "/accounts?page[limit]=100";
    const seen = new Set<string>(); const rows: z.infer<typeof pontoAccount>[] = [];
    while(path) {
      const url=new URL(path,ORIGIN);
      if(url.origin!==ORIGIN||url.pathname!=="/accounts"||seen.has(url.href)||seen.size>=10)throw new PontoError("pagination_incomplete");
      seen.add(url.href);
      const page=z.object({data:z.array(pontoAccount),links:z.object({next:z.string().nullish()}).optional()}).parse(await this.get(url.href));
      rows.push(...page.data);path=page.links?.next||null;
    }
    return rows.filter(r=>!r.attributes.deprecated).map(r=>({id:r.id,label:r.attributes.description||"Cuenta Ponto",maskedReference:r.attributes.reference?"•••• "+r.attributes.reference.slice(-4):"Sin referencia",currency:r.attributes.currency}));
  }
  async account(accountId: string) {
    id.parse(accountId);
    const data = z.object({ data: pontoAccount }).parse(await this.get(`/accounts/${accountId}`)).data;
    if (data.id !== accountId || data.attributes.deprecated) throw new PontoError("account_unavailable");
    return data;
  }
  async transactions(accountId: string) {
    id.parse(accountId);
    const pathname = `/accounts/${accountId}/transactions`;
    let path: string | null = pathname + "?page[limit]=100";
    const seen = new Set<string>(); const rows: PontoTransaction[] = [];
    let synchronizedAt: string | null = null;
    while (path) {
      const url = new URL(path, ORIGIN);
      if (url.origin !== ORIGIN || url.pathname !== pathname || seen.has(url.href) || seen.size >= 100) throw new PontoError("pagination_incomplete");
      seen.add(url.href);
      const page = z.object({ data: z.array(pontoTransaction), links: z.object({ next: z.string().nullish() }).optional(), meta: z.object({ synchronizedAt: z.string().nullish() }).optional() }).parse(await this.get(url.href));
      rows.push(...page.data);
      synchronizedAt = page.meta?.synchronizedAt || synchronizedAt;
      path = page.links?.next || null;
    }
    return { rows, synchronizedAt };
  }
}
