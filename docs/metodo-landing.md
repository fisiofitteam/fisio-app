# Landing pública /metodo

## Uso del equipo

- Página pública: `/metodo`. Enlace recomendado para Instagram: `/metodo?utm_source=instagram&utm_medium=bio&utm_campaign=metodo`.
- Contenido → Método: `/fisio/contenido/metodo`. CEO y setter ven las métricas. Solo CEO puede editar y publicar (`?tab=editor`).
- El editor guarda titulares, textos, orden de preguntas e historias, visibilidad, imágenes, vídeo, SEO, herramientas, botones y mensaje de WhatsApp. El número vacío hereda la configuración comercial de la landing de agenda; no hay un segundo número obligatorio.
- Imágenes: subida mediante el componente existente de Blob. Vídeos: URL de YouTube o archivo MP4/WebM/MOV público de Blob; portada opcional. Nada se reproduce automáticamente. La presentación y ambas fotos de Ales están preparadas, sin material de stock ni sustitutos inventados.
- Resultados: seleccionar una fuente de Testimonios (general/legacy, preparada) o Casos de éxito activos. Escribir el nombre público, título, extracto y comparativa autorizados; documentar la autorización y activar su publicación. No se copian notas clínicas, datos del paciente ni texto privado. Si cambia el origen, la historia deja de aparecer hasta revisar y renovar su selección/autorización. Para renovar una fuente modificada, quitarla de esta selección y volver a añadirla desde el buscador; esto no borra el original.
- Las historias sin autorización no pueden publicarse. La autorización exige verificar que cubre **este uso público** del archivo y los textos. Una biblioteca interna no constituye permiso de publicación. La sección pública se omite mientras no haya historias autorizadas.
- Las herramientas están desactivadas inicialmente; activarlas individualmente y mostrar su sección cuando corresponda.
- Los cambios usan revisión optimista para evitar pisar una edición concurrente. Desactivar «Página publicada» devuelve 404 en la ruta pública y el contacto.

## Medición y atribución

No se crea identificador analítico hasta aceptar la medición. Aceptar y rechazar tienen igual prominencia. La preferencia se conserva 180 días; se puede cambiar desde el pie. Retirarla desactiva la medición y elimina el visitante y sus eventos/referencias asociadas. No elimina datos operativos del CRM, facturas o transacciones. Los vídeos externos solo se cargan tras pulsar su botón, con aviso previo.

- Visitantes = navegadores consentidos, no personas ni todo el tráfico.
- Página, scroll (25/50/75/100), vídeo (inicio y porcentaje **realmente reproducido**, sin contar saltos ni repeticiones), historias y filtros se deduplican por visita y objetivo.
- UTMs: etiquetas limitadas. No se guardan URL completa, fbclid, email, teléfono, respuestas clínicas o IP en claro. Se conserva la primera fuente consentida.
- WhatsApp: redirección HTTP del mismo origen, sin popup; el número se resuelve en servidor. Solo con consentimiento se añade una referencia aleatoria `MF-…` al texto. Una apertura es **clic**, nunca mensaje enviado. La medición no impide contactar si falla.
- Conversación real: el equipo confirma haber recibido ese mensaje en «Métricas y atribución». Al agendar, introduce la referencia en «Origen /método» de la tarjeta de la llamada. Closer solo puede vincular sus llamadas; CEO/setter pueden revisar el conjunto. La referencia y el lead tienen enlace único; se exige motivo para corregir una atribución.
- No se modifica la atribución UTM que ya tuviera el lead ni se emparejan personas por parecido, teléfono o proximidad temporal. La API actual de Skalex no ofrece confirmación del mensaje con esta referencia; por eso esta fase es explícita, no automática.
- El informe usa la **cohorte de referencias creadas en el intervalo** (Europe/Madrid), con resultados conocidos hasta ahora, aunque la venta ocurra después. Fuentes, campañas, conversaciones, llamadas y ventas aparecen separadas.
- Facturado: facturas EUR no anuladas, relacionadas directamente con una venta del lead atribuido. Cobros: únicamente transacciones de ingreso vinculadas explícitamente por `PatientInvoice.transactionId`. Sin enlace documental se muestra ausencia de información, no se presume cobro. No equivale a caja neta ni atribuye devoluciones/renovaciones no relacionadas.
- Exportación JSON agregada y API autenticada `GET /api/metodo/admin/metrics?from=AAAA-MM-DD&to=AAAA-MM-DD&format=aggregate`: contrato `schemaVersion:1`, definiciones, cobertura, límites y desglose de campañas. No incluye contactos individuales y queda preparada para el agente de dirección. No se crea una clave pública ni se amplían permisos del agente.

## Arquitectura y seguridad

- CMS reutilizado: `LandingConfig`, id `metodo`. Las otras landings no cambian.
- DTO público explícito: no incluye IDs de fuentes, autorizaciones, notas, fichas ni fuentes ocultas. React escapa los textos. URLs de medios y herramientas se validan con listas permitidas; no HTML arbitrario ni enlaces privados.
- Ruta pública exacta en middleware; las rutas `/api/metodo/admin/*` siguen protegidas por sesión y autorización en servidor. Mutaciones exigen mismo origen, contenido JSON y límites de tamaño. Endpoints de analítica tienen límites por minuto persistidos usando HMAC, sin almacenar IP en claro.
- Configuración, atribución y retirada generan controles de concurrencia/auditoría cuando corresponde. No se modifica la estructura de tablas existentes salvo el campo de relación virtual Prisma en Lead.
- Cinco tablas nuevas e índices: `MetodoVisitor`, `MetodoEvent`, `MetodoContact`, `MetodoAudit`, `MetodoRateLimit`. DDL idempotente en `lib/metodo/migration.ts`, replicado por modelos en los tres esquemas. Se inicializan en la primera operación de analítica/admin bajo bloqueo transaccional PostgreSQL. No ejecutar `prisma db push` para este cambio. La lectura pública de contenido no necesita estas tablas.
- Retención diaria `/api/cron/metodo-retention` a las 03:40 UTC, protegida por `CRON_SECRET`. Eventos/visitantes 180 días, referencias/auditoría 730 días; buckets de rate limit caducan en 2 minutos y se limpian a diario. Confirmar que `CRON_SECRET` está configurada en Vercel para habilitar la limpieza programada.
- Si la cuenta de DB no permite DDL, las métricas fallan de forma explícita y WhatsApp sigue disponible sin atribución; aplicar el DDL versionado con el procedimiento de administración de DB.
- SEO/canonical/Open Graph propios, render servidor dinámico, imágenes Next optimizadas, vídeo diferido, sin SDK publicitario. Viewport con zoom, foco visible, enlace de salto, FAQ nativa, reduced-motion y diseño móvil.

## Comprobaciones

- `node scripts/test-metodo.cjs`: pruebas sintéticas de publicación autorizada, revocación por cambio de fuente, DTO público, secciones ocultas, URLs, origen, roles, consentimiento, WhatsApp, visionado sin saltos y fechas con cambio horario.
- `node scripts/test-skalex-insights.cjs`: regresión del contexto comercial existente.
- `npm run build:prod`: build completo. El proyecto ya omite lint/tipos durante build; se ejecuta `npx tsc --noEmit` por separado y se documentan los errores previos fuera de esta funcionalidad.
- Revisión visual con componentes reales a ancho de escritorio y viewport de iframe de 390 px. No equivale a probar el navegador nativo de Instagram en iPhone/Android; conviene comprobar el enlace final desde ambos dispositivos antes de cambiar la bio.
- Material pendiente de selección: foto/vídeo principal, dos fotos de Ales, presentación y testimonios/casos autorizados. Hasta entonces se muestra una composición tipográfica de marca, no fotos ajenas ni resultados ficticios.

## Reversión

Despublicar desde el editor detiene el acceso público y la medición nueva. Se puede revertir el commit sin borrar datos existentes; las cinco tablas aditivas pueden quedarse para conservar el historial. No eliminar tablas como parte de una reversión rutinaria.
