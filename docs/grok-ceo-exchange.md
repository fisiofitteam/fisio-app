# CEO IA: canal de dirección (v1)
- Founder exacto configurado por GROK_CEO_FOUNDER_ID; sesión CEO obligatoria.
- Ejecutar scripts/sql/grok-ceo-exchange.sql en PostgreSQL de producción antes de habilitar. Migración exclusivamente aditiva, sin db push global.
- El buzón permite registrar encargos de análisis y decisiones sobre propuestas de informes; no son autorizaciones ejecutables. Se preserva el informe original, el texto de propuesta se obtiene del servidor, y un índice único evita doble decisión. La respuesta se guarda una vez, con notificación transaccional.
- Entrega de encargos: credencial dedicada GROK_CEO_EXCHANGE_TOKEN (>=32 caracteres), **no reutilizar** los tokens de informes/métricas. Sin credencial configurada no hay acceso de Grok al buzón. No guardar secretos en repo.
- GET /api/integrations/grok-ceo/exchange, Authorization: Bearer <token>, devuelve hasta 25 encargos pendientes para el founder configurado. POST al mismo endpoint, JSON {id,response}, respuesta meramente documental. Sin herramientas operativas.
- Configurar la rutina de Grok para consumir este endpoint y devolver análisis según ID después de validar el canal. No se activa rutina desde la app. Sin pacientes, secretos ni datos personales.
- Pruebas: npx tsx scripts/test-grok-ceo-exchange.ts; pruebas de integración pendientes (403/401, idempotencia, doble decisión, notificación única, migración, vista autenticada).
