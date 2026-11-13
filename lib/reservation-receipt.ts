// Provider-side evidence only. A reservation link is for one fixed, one-shot charge.
// Never accept just a browser-supplied order id or a different sale's captured order.
type SaleReference={paymentToken:string;paypalOrderId:string|null;amountCents:number;currency:string};
export function matchesReservationAmount(cents:number,currency:string,amount:{value?:unknown;currency_code?:unknown}|undefined){
  return !!amount && typeof amount.value==="string" && /^\d+(?:\.\d{1,2})?$/.test(amount.value) &&
    Math.round(Number(amount.value)*100)===cents && cents>0 && typeof amount.currency_code==="string" && amount.currency_code.toLowerCase()===currency.toLowerCase();
}
export function assertReservationPayPalOrder(sale:SaleReference,order:any){
  const unit=order?.purchase_units?.[0];
  if(!sale.paypalOrderId||sale.paypalOrderId!==order?.id||order?.purchase_units?.length!==1||unit?.custom_id!==sale.paymentToken||!matchesReservationAmount(sale.amountCents,sale.currency,unit?.amount))
    throw Error("La orden no corresponde a esta reserva.");
  if(order.status==="COMPLETED"){
    const captures=unit?.payments?.captures;
    if(!Array.isArray(captures)||captures.length!==1||captures[0]?.status!=="COMPLETED"||!captures[0]?.id||!matchesReservationAmount(sale.amountCents,sale.currency,captures[0]?.amount))
      throw Error("La señal aún no tiene una captura verificada.");
  }
}
