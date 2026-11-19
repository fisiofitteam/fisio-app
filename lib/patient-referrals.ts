export const REFERRAL_AMOUNT_EUROS = 50;
export const REFERRAL_PROGRAMS = ["RECUPERA", "CONSOLIDA", "ADVANCE"] as const;
export function isReferralProgram(programType: string | null | undefined): boolean {
  return REFERRAL_PROGRAMS.some(program => program === programType);
}
export const validReferralCode = (code: unknown): code is string =>
  typeof code === "string" && /^[A-Za-z0-9_-]{32}$/.test(code);
export function buildReferralMessage(url: string): string {
  return "Si el dolor te está limitando al entrenar, te recomiendo FisioFitCross, el equipo con el que trabajo. Con mi enlace tienes 50 € de descuento al contratar tu primer programa; a mí también me regalan 50 € cuando te unas. Aquí puedes ver cómo trabajan y reservar una valoración gratuita: " + url;
}
export const normalizeReferralEmail = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
export function normalizeReferralPhone(value: string | null | undefined): string {
  let digits = (value ?? "").replace(/\D/g, "").replace(/^00/, "");
  if(digits.length === 9) digits = "34" + digits;
  return digits;
}
export function sameReferralContact(a: {email?:string|null;phone?:string|null}, b: {email?:string|null;phone?:string|null}) {
  const email=normalizeReferralEmail(a.email), phone=normalizeReferralPhone(a.phone);
  return !!email && email===normalizeReferralEmail(b.email) || !!phone && phone===normalizeReferralPhone(b.phone);
}
export type ReferralSale = {status:string;isReservation:boolean;programType:string;amountCents:number;paidAt:Date|string|null;refundedAt?:Date|string|null};
export function referralQualifyingSale(sales: ReferralSale[]) {
  return sales.find(sale => sale.status==="paid" && !sale.isReservation && !sale.refundedAt && !!sale.paidAt && sale.amountCents>0 && isReferralProgram(sale.programType)) ?? null;
}
