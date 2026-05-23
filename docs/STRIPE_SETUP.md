# Configuración Stripe — guía de setup

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
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Tras crear el endpoint, Stripe mostrará el "Signing secret" → ese valor va
   en `STRIPE_WEBHOOK_SECRET`

## 3. Verificar que está configurado

Tras desplegar v57.0, hacer un test:
- En Stripe Dashboard → Developers → Webhooks → endpoint
- Click "Send test webhook" → elegir `checkout.session.completed`
- En la app: revisar los logs de Vercel. Debe aparecer:
  ```
  [stripe-webhook] Received event: checkout.session.completed (id=evt_xxx)
  ```

## 4. Tarjetas de prueba

En modo TEST, Stripe acepta estas tarjetas para simular pagos:
- `4242 4242 4242 4242` → pago exitoso
- `4000 0000 0000 0002` → tarjeta declinada
- `4000 0000 0000 9995` → fondos insuficientes
- Fecha caducidad: cualquiera futura (ej. `12/30`)
- CVV: cualquier 3 dígitos (ej. `123`)

Klarna se prueba con `4000 0000 0000 0010` y email `test@example.com`.
