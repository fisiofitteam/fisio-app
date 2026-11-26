# Banco y tesorería — Ponto AIS

Pantalla: `/fisio/finanzas/banco`. Solo el founder configurado, con rol CEO activo.

## Activación

1. En Ponto, conectar la cuenta de CaixaBank y completar el consentimiento bancario. Crear una integración **personalizada AIS only** para esa cuenta. No PIS.
2. En Vercel / proyecto `fisio-app`, guardar `PONTO_CLIENT_ID` y `PONTO_CLIENT_SECRET` como secretos exclusivos de Production. Nunca introducirlos en Git, el buzón o Grok. Redeploy.
3. Abrir Banco y tesorería, «Buscar cuenta autorizada en Ponto» y «Usar esta cuenta». Solo admite EUR. La selección se guarda en la base de datos. Opcionalmente, `PONTO_ACCOUNT_IDS` permite fijar hasta cinco identificadores Ponto (no IBAN); si está configurada, prevalece sobre la selección de pantalla.
4. «Recoger movimientos». Esto lee los datos ya disponibles en Ponto; no fuerza una consulta bancaria ni simula presencia del usuario. Cron Vercel en producción a las 00:20, 06:20, 12:20 y 18:20 UTC. Requiere el `CRON_SECRET` existente.
5. Revisar cada gasto en `/fisio/finanzas/gastos-pendientes`. Ninguna importación ni regla escribe en Transaction. Solo la validación explícita del founder crea un asiento.

Pausar detiene nuevas importaciones; revocar en el dashboard de Ponto elimina el acceso del proveedor. Al caducar el consentimiento, renovarlo en Ponto.

## Datos y controles

- El único POST a Ponto obtiene el token OAuth. Resto: GET de cuentas y transacciones asentadas. No endpoints de pago, transferencia, sincronización forzada ni pendientes de tarjeta.
- El token debe declarar exactamente `ai`; se rechaza `pi` y cualquier alcance adicional. Tokens en memoria, no persistidos ni registrados. URLs de paginación fijadas al host y recurso esperado; sin redirecciones.
- Cuenta e identificador de movimiento forman una clave única. Reimportar no repite candidatos. Cambios de datos en un ID conocido marcan conflicto y bloquean la validación. Una importación incompleta no guarda datos parciales de esa cuenta; puede haber otras cuentas importadas correctamente.
- Lease compartida impide solapamientos. Identidad de lease protege el desbloqueo; cada cuenta se guarda en una transacción con timeout. La siguiente ejecución reintenta de forma idempotente.
- Datos mínimos: referencia de cuenta enmascarada, saldos, conceptos de salidas y nombre de proveedor. Entradas sin nombre ni concepto de clientes; solo se conserva si es un abono de Stripe. No consultas a tablas clínicas.
- Hipoteca: se excluye automáticamente un débito EUR de 203 € identificado como hipoteca. El importe por sí solo no excluye. Otras exclusiones y reglas requieren revisión del founder. Reglas exactas por proveedor normalizado, opcionalmente por importe, solo para nuevas importaciones.
- Duplicados entre fuentes: aviso por importe/proveedor/fecha cercana y frente al libro. Nunca se descarta una coincidencia automáticamente. Duplicados bancarios con huella idéntica pueden excluirse y restaurarse explícitamente, conservando el historial. Asientos aprobados no se modifican desde esta pantalla.
- Stripe: consulta exclusivamente liquidaciones. Conciliación por signo positivo, marca Stripe, moneda, importe y fecha ±5 días, con correspondencia única en ambos lados. Nunca vuelve a registrar las ventas ni contabiliza el abono. Ambigüedades permanecen pendientes.
- Suscripciones: tres cargos similares con intervalos mensuales o anuales. Son sugerencias, no contratos confirmados. Las reglas no aprueban gastos.
- Previsión: saldo actual EUR reciente (<48h), consentimiento vigente, histórico ≥30 días, sin conflictos/duplicados pendientes/errores. Extrapolación lineal de entradas y salidas observadas en 30 días a 7/30/90 días. Incluye reserva personal mínima 203 €/mes; no suma suscripciones dos veces. No incluye compromisos futuros ni sustituye contabilidad. No presenta un runway fiable con este historial.
- Grok recibe una lista explícita de agregados en `banking` del endpoint de métricas existente. No credenciales, cuentas, movimientos, proveedores, conceptos ni detalles personales. Sin ampliar su capacidad de escritura.

## Despliegue y pruebas

`build:prod` ejecuta las pruebas y la migración aditiva `scripts/sql/ponto-bank-finance.sql` junto a las migraciones CEO anteriores. Solo DDL propio, sin schema push ni lectura de datos clínicos. Preview no ejecuta migraciones ni cron.

`npm run test:ponto`: transporte AIS y rechazo PIS, paginación externa, normalización, hipoteca, recurrencia, conciliación ambigua, importación/reimportación, permisos founder, revisión concurrente, exclusión y conflicto, minimización de agregados. Datos sintéticos y almacén transaccional de prueba, sin proveedores ni DB reales.

Además, validar migración con PostgreSQL aislado (idempotencia, claves únicas, rollback) y build Next antes de publicar. Una prueba real tras el consentimiento debe confirmar saldo/fecha, importación y estado de la bandeja; no aprobar gastos como prueba.

## Revisión de trabajo anterior

Se integra el contenido del PR #78 (evidencia de consultas/respuestas del buzón), resolviendo conflictos con el asistente del equipo del #79. Los PR #1–7 del repositorio de coordinación son propuestas documentales; no son dependencias técnicas ni se interpretan como permisos para Grok.

Referencias oficiales verificadas: https://documentation.myponto.com/developers/custom-integrations y https://documentation.myponto.com/api/curl .
