# Configuración Stripe — guía de setup

## Migración aditiva antes de desplegar facturación y recaudado

Antes de publicar esta versión, aplicar en PostgreSQL el archivo
`scripts/sql/20261019-renewal-checkout-billing.sql`. Añade únicamente tres
columnas opcionales a `RenewalCheckout`: precio completo, señal aplicada y
reserva exacta. Es idempotente y no actualiza ni elimina filas existentes.
No ejecutar `prisma db push`, reseteos ni rellenos automáticos del histórico.

El orden es: copia de seguridad habitual, aplicar ese SQL aditivo y después
desplegar el código con el cliente Prisma regenerado. El build regenera el
cliente; **no aplica el SQL automáticamente**. Hasta que existan las columnas,
no desplegar código que las consulte, tampoco una preview que comparta la
misma base de datos. Las filas antiguas quedan a `NULL`. El SQL usa una
transacción y un tiempo máximo de espera de bloqueo de cinco segundos;
si encuentra tráfico que lo impide, falla y se puede reintentar.

Los enlaces nuevos guardan el precio completo junto con el saldo y la señal,
sin cambiar cuánto cobran Stripe o PayPal. La creación del enlace y la
aplicación de la reserva son una sola transacción; si la reserva ya cambió,
se rechaza el enlace para no aplicarla dos veces. La facturación valida
precio completo = saldo + señal y el paciente de la reserva exacta. Los
depósitos históricos sin esa vinculación siguen con aviso para revisión.

## 1. Variables de entorno en Vercel

Antes de testear la app en producción, hay que añadir estas variables en
Vercel → Settings → Environment Variables:

### Modo TEST (durante desarrollo)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

STRIPE_PRICE_RECUPERA_4M=price_...
STRIPE_PRICE_RECUPERA_6M=price_...
STRIPE_PRICE_CONSOLIDA_4M=price_...
STRIPE_PRICE_CONSOLIDA_6M=price_...
```

Cuando pasemos a producción, sustituiremos por las `sk_live_` y `pk_live_`.

## 2. Configurar webhook en Stripe

1. Ir a https://dashboard.stripe.com/test/webhooks (modo TEST)
2. Pulsar "Add endpoint"
3. URL: `https://app.fisiofitteam.com/api/webhooks/stripe`
4. Eventos a escuchar (seleccionar manualmente):
   - `checkout.session.completed`
   - `invoice.paid` — imprescindible: registra la primera cuota y las siguientes.
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Tras crear el endpoint, Stripe mostrará el "Signing secret" → ese valor va
   en `STRIPE_WEBHOOK_SECRET`

## 3. Verificar que está configurado

En modo TEST, hacer un test:
- En Stripe Dashboard → Developers → Webhooks → endpoint
- Click "Send test webhook" → elegir `checkout.session.completed`
- En la app: revisar los logs de Vercel. Debe aparecer:
  ```
  [stripe-webhook] Event: checkout.session.completed (id=evt_xxx)
  ```
- Completar un checkout de prueba con cuotas y comprobar también `invoice.paid`.
  La activación y el recibo son eventos independientes. Si el recibo llega antes
  de que se active el contrato, el endpoint devuelve 500 para conservar el reintento.
- Reenviar el mismo `invoice.paid`: no debe aparecer un segundo ingreso.
- Una cuota cobrada otro mes debe tener la fecha efectiva de pago de Stripe,
  aunque el webhook se entregue o concilie más tarde.

## Conciliar cuotas ya cobradas

`GET /api/cron/installment-reconcile` se autentica con
`Authorization: Bearer <CRON_SECRET>`. `?dryRun=1` revisa recibos reales sin
cambiar datos; `saleId`, `renewalId` y los cursores permiten lotes concretos.
No ejecuta cobros, capturas, activaciones ni cancelaciones en proveedores.

El conciliador consulta facturas pagadas de Stripe y transacciones completadas
de suscripciones PayPal. Nunca convierte una cuota esperada en recaudación.
Los recibos nuevos tienen un ID determinista y los movimientos antiguos solo
se vinculan si proveedor, importe, categoría y fecha permiten una coincidencia
única. Se conserva su ID e importe; el texto guarda la fecha antigua y el
movimiento utiliza la fecha efectiva del proveedor. Las coincidencias dudosas
se indican para revisión y se dejan intactas.

Facturación representa el contrato completo; Recaudado representa los cobros
confirmados. `invoice.paid` debe seguir habilitado aunque exista el cron.

## 4. Tarjetas de prueba

En modo TEST, Stripe acepta estas tarjetas para simular pagos:
- `4242 4242 4242 4242` → pago exitoso
- `4000 0000 0000 0002` → tarjeta declinada
- `4000 0000 0000 9995` → fondos insuficientes
- Fecha caducidad: cualquiera futura (ej. `12/30`)
- CVV: cualquier 3 dígitos (ej. `123`)

Klarna se prueba con `4000 0000 0000 0010` y email `test@example.com`.
