import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { parseInvoiceDetails } from "../lib/invoice-details";
let actor: any = { id: "ceo", role: "ceo" };
let stored: any;
const patient: any = { id: "p1", fullName: "Original", contractDNI: "12345678Z", email: "original@example.test", shippingStreet: "Mayor", shippingNumber: "1" };
const issuer = { fullName: "Emisor", fiscalName: null, taxId: "ABC", fiscalAddress: "Dirección emisor", iban: "IBAN" };
const original = (Module as any)._load;
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request.endsWith("/lib/session") || request.endsWith("/lib/session.ts")) return { getActiveProfessional: async () => actor };
  return original.call(this, request, ...args);
};
(globalThis as any).prisma = {
 patient: { findUnique: async () => ({ ...patient }) },
 professional: { findUnique: async () => ({ ...issuer }) },
 patientInvoice: {
   findFirst: async () => ({ sequence: 4 }),
   create: async ({ data }: any) => { stored = data; return { id: "invoice", ...data }; },
 },
};
async function main() {
 const { POST, GET } = await import("../app/api/patients/[id]/invoices/route");
 const params = { params: { id: "p1" } };
 const request = (body: any) => new NextRequest("https://example.test/api/patients/p1/invoices", { method: "POST", body: JSON.stringify(body) });
 const base = { concept: "Servicio", baseAmount: 100, vatExempt: false, vatRate: 21, irpfRate: 7 };
 const defaults = await GET(new NextRequest("https://example.test/api/patients/p1/invoices?defaults=1"), params);
 assert.equal((await defaults.json()).details.clientTaxId, "12345678Z");
 const details = { clientName: "Empresa cliente", clientTaxId: "B123", clientAddress: "Otra dirección", clientEmail: "", issuerName: "Otra razón social", issuerTaxId: "OTRO", issuerAddress: "Otra sede", issuerIban: "" };
 assert.equal((await POST(request({ ...base, details }), params)).status, 200);
 for (const [key,value] of Object.entries(details)) assert.equal(stored[key], value || null);
 assert.equal(stored.totalAmount, 114);
 assert.equal(stored.number.endsWith("0005"), true);
 assert.equal(patient.fullName, "Original");
 assert.equal(issuer.fullName, "Emisor");
 assert.equal((await POST(request(base), params)).status, 200);
 assert.equal(stored.clientTaxId, "12345678Z");
 for (const invalid of [{ details: { clientName: "" } }, { details: { issuerName: 42 } }, { vatRate: -1 }, { irpfRate: 101 }, { issueDate: "invalid" }]) {
   assert.equal((await POST(request({ ...base, ...invalid }), params)).status, 400);
 }
 assert.deepEqual(parseInvoiceDetails({ number: "hijack", clientName: " Nombre " }), { clientName: "Nombre" });
 actor = { id: "fisio", role: "fisio" };
 assert.equal((await POST(request(base), params)).status, 403);
 assert.equal((await GET(new NextRequest("https://example.test/api/patients/p1/invoices?defaults=1"), params)).status, 403);
 console.log("PASS: invoice overrides, explicit blanks, default DNI, unchanged profiles, totals, validation and CEO access");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
