// Validation before creating any financial record or accepting an external receipt.
// No database or gateway is contacted; transactions are additionally covered by the isolated integration suite.
import assert from "node:assert/strict";
import {canOperateReservation,reserveEmail} from "../lib/initial-reservation";
import {assertReservationPayPalOrder,matchesReservationAmount} from "../lib/reservation-receipt";
const lead={contactType:"email",contactValue:" Reserved@fixture.invalid ",email:null};
assert.equal(reserveEmail(lead),"reserved@fixture.invalid");
assert.throws(()=>reserveEmail({...lead,contactType:"phone"}));assert.throws(()=>reserveEmail(lead,{}));
assert(canOperateReservation({id:"manager",role:"ceo"},null));
assert(canOperateReservation({id:"clinician",role:"fisio",extraRoles:["closer"]},"clinician"));
assert(!canOperateReservation({id:"clinician",role:"fisio",extraRoles:["closer"]},"other"));
assert(!canOperateReservation({id:"setter",role:"setter"},"setter"));
const sale={paymentToken:"synthetic",paypalOrderId:"order-fixture",amountCents:10001,currency:"eur"};
const amount={value:"100.01",currency_code:"EUR"};
const capture={status:"COMPLETED",id:"capture-fixture",amount};
const unit={custom_id:"synthetic",amount,payments:{captures:[capture]}};
const paid={id:"order-fixture",status:"COMPLETED",purchase_units:[unit]};
assert.doesNotThrow(()=>assertReservationPayPalOrder(sale,paid));
assert.doesNotThrow(()=>assertReservationPayPalOrder(sale,{...paid,status:"APPROVED",purchase_units:[{custom_id:unit.custom_id,amount}]}));
assert.throws(()=>assertReservationPayPalOrder(sale,{...paid,id:"wrong"}));
assert.throws(()=>assertReservationPayPalOrder(sale,{...paid,purchase_units:[{...unit,custom_id:"other"}]}));
for(const wrong of [{value:"100.00",currency_code:"EUR"},{value:"100.01",currency_code:"USD"},{value:"100.005",currency_code:"EUR"},{value:"0",currency_code:"EUR"}]){
 assert(!matchesReservationAmount(10001,"EUR",wrong));
 assert.throws(()=>assertReservationPayPalOrder(sale,{...paid,purchase_units:[{...unit,payments:{captures:[{...capture,amount:wrong}]}}]}));
}
assert.throws(()=>assertReservationPayPalOrder(sale,{...paid,purchase_units:[{...unit,payments:{captures:[{...capture,status:"PENDING"}]}}]}));
console.log("PASS: reservation identity, closer scope, verified single capture/order/amount/currency.");
