# Export · Sistema Agenda Pública → Leads → Llamadas

Este bundle contiene **todo el flujo comercial** de FisioFit Team, extraído de
la app principal en su estado actual. El objetivo es portarlo a la app de
**nutrición** (mismo concepto: consulta gratuita por videollamada, pero para
nutrición deportiva en lugar de fisio).

Está pensado para que otra terminal (otro Claude/dev) lo recree en un proyecto
Next.js limpio o lo integre en un proyecto en curso.

---

## 0. Resumen funcional (qué hace todo esto)

```
┌────────────────────────────────────────────────────────────────┐
│ 1. LANDING PÚBLICA  /agenda                                    │
│    El lead rellena formulario (datos + cuestionario) y         │
│    elige hueco disponible. Slots calculados desde Google        │
│    Calendar + plantilla de horarios del equipo.                │
│      ↓                                                          │
│ 2. POST /api/agenda/book                                       │
│    Crea evento en Calendar (con Meet auto), genera Lead en BD, │
│    auto-asigna closer según patrón semanal,                    │
│    notifica a TODOS los setters.                               │
│      ↓                                                          │
│ 3. SETTER (/fisio/leads)                                       │
│    Ve los leads pendientes de presentar al closer.             │
│    Contacta por WhatsApp, dice quién atenderá → marca           │
│    "avisado" → desaparece de su panel, notifica al closer.     │
│      ↓                                                          │
│ 4. CLOSER (/fisio/llamadas-venta)                              │
│    Ve TODOS sus leads. Workflow: contactado → recordatorio →    │
│    videollamada → marca won/lost/no_show. Si lost, abre        │
│    follow-up con 4 fechas (24h, 48-72h, 30d, 90d).             │
│      ↓                                                          │
│ 5. CONVERSIÓN                                                  │
│    /api/leads/convert genera link de pago Stripe y, al pagar,   │
│    el lead se vincula al Patient creado.                       │
└────────────────────────────────────────────────────────────────┘

           ┌─────────────────────────────────────────┐
           │ Paralelo: /fisio/llamadas               │
           │ Llamadas post-conversión (atención al   │
           │ paciente, optimización, renovación).    │
           │ Independiente del flujo de venta.       │
           └─────────────────────────────────────────┘
```

---

## 1. Stack y dependencias

- **Next.js 14** App Router (React server components + client islands).
- **Prisma 5.22** con Postgres (Neon en prod, SQLite en dev).
- **Tailwind CSS** + estilos inline en componentes (no usamos shadcn/ui).
- **Google Calendar API** vía OAuth (refresh token persistido en BD).
- **Resend / WhatsApp** mencionados en otros sitios; aquí solo notificaciones
  in-app (no email/sms transaccionales en este flujo).
- **TypeScript strict.**
- **lucide-react** para iconos (`Calendar`, `Trophy`, etc.) — opcional, los
  componentes inline usan emojis.

Dependencias mínimas del bundle:
```json
{
  "dependencies": {
    "next": "^14",
    "react": "^18",
    "react-dom": "^18",
    "@prisma/client": "^5.22",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "prisma": "^5.22",
    "typescript": "^5",
    "@types/react": "^18",
    "@types/node": "^20",
    "tailwindcss": "^3"
  }
}
```

---

## 2. Variables de entorno necesarias

```bash
# Base de datos (Neon o Postgres local)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Encryption para tokens Google guardados en BD (lib/encryption.ts; no
# incluido en este bundle, es trivial: AES-256-GCM con clave de 32 bytes)
ENCRYPTION_KEY="<32 bytes hex>"

# Google OAuth para Calendar (https://console.cloud.google.com/)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="https://app.tudominio.com/api/google/callback"

# Sesiones (cookies firmadas)
SESSION_SECRET="<32+ bytes>"
```

El módulo `lib/encryption.ts` (no incluido) expone:
```ts
export function encrypt(plaintext: string): string;
export function decrypt(ciphertext: string): string;
```
Implementación recomendada: `crypto.createCipheriv("aes-256-gcm", key, iv)`
con clave de `ENCRYPTION_KEY` y un IV aleatorio prefijado al ciphertext.

El módulo `lib/googleOAuth.ts` (no incluido) expone:
```ts
export async function refreshAccessToken(refreshToken: string):
  Promise<{ access_token: string; expires_in: number; refresh_token?: string }>;
```
Implementación: POST a `https://oauth2.googleapis.com/token` con
`grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`.

El módulo `lib/session.ts` / `lib/auth.ts` (no incluido) expone:
```ts
export type ActiveProfessional = {
  id: string;
  fullName: string;
  role: "ceo" | "head_success" | "fisio" | "setter" | "closer";
  isManager: boolean;  // role === "ceo" || role === "head_success"
};
export async function getActiveProfessional(): Promise<ActiveProfessional | null>;
```
Implementación: lee cookie de sesión firmada, mapea a `Professional` en BD.

---

## 3. Mapa de archivos del bundle (`code/`)

### Esquema
- `prisma/schema-relevant.prisma` — modelos Lead, Professional, DefaultClosingShift,
  WeekOverride, ClosingShift, AgendaBlock, TeamNotification, ScheduledCall,
  LandingConfig, GoogleCalendarConnection.

### Landing pública /agenda
- `app/agenda/page.tsx` — servidor: carga copy y renderiza AgendaLanding.
- `app/agenda/gracias/page.tsx` — servidor: confirmación con vídeo embed.
- `components/AgendaLanding.tsx` — formulario 2 pasos (datos + slots).
- `components/AgendaGracias.tsx` — pantalla post-reserva con vídeo de preparación.

### APIs públicas (sin auth)
- `app/api/agenda/slots/route.ts` — GET slots disponibles.
- `app/api/agenda/book/route.ts` — POST reserva. Crea evento Calendar + Lead +
  notifica setters.

### Helpers (lib/)
- `lib/agendaSlots.ts` — calcula slots libres cruzando plantilla con Calendar.
- `lib/agendaTemplate.ts` — resuelve franjas por semana (plantilla / override /
  bloqueos) + utilidades de hora Madrid TZ-safe.
- `lib/scheduleResolver.ts` — `whoseSlot(date)` → closerId del slot.
- `lib/googleCalendar.ts` — wrapper OAuth + `listEvents` + `createEventWithMeet`.
- `lib/notifications.ts` — `notifySetters`, `notifyProfessional`,
  `markLeadNotificationsRead`, helpers de in-app notifications.
- `lib/landing-config.ts` — lectura desde BD del copy (con fallback a defaults).
- `lib/landing-content.ts` — definiciones de tipos del copy + valores por defecto.

### APIs internas (auth requerida)
- `app/api/leads/route.ts` — CRUD: POST crear, PATCH editar, DELETE borrar.
- `app/api/leads/convert/route.ts` — convertir Lead → Patient (Stripe-friendly).
- `app/api/leads/[id]/mark-setter-notified/route.ts` — setter avisó al closer.
- `app/api/leads/[id]/mark-closer-contacted/route.ts` — closer envió caso éxito.
- `app/api/leads/[id]/mark-reminder-sent/route.ts` — closer envió recordatorio.

### Páginas internas
- `app/fisio/leads/page.tsx` — vista del SETTER (leads pendientes de presentar).
- `app/fisio/llamadas-venta/page.tsx` — vista del CLOSER / CEO con filtros por status.
- `app/fisio/llamadas/page.tsx` — llamadas post-conversión (a pacientes activos).

### Componentes principales
- `components/SetterLeadsView.tsx` — UI completa del setter (tabs por closer,
  modal de "Avisado").
- `components/CallsListView.tsx` — UI completa del closer (tabs por status,
  modal de detalle del lead, transición de estados, follow-up trigger).
- `components/CallsList.tsx` — UI de llamadas post-conversión.

---

## 4. Flujos detallados

### 4.1 Reserva pública

1. Usuario visita `/agenda`. El componente `AgendaLanding` muestra **paso 1**:
   formulario con `fullName, email, phone, instagram, motivo,
   tratamientosPrevios, impactoCrossfit`. Validación cliente: mínimos por
   campo, mensajes de error inline.

2. Pulsa "Siguiente". Si pasa validación → carga `GET /api/agenda/slots`.
   Backend ejecuta `getAvailableSlots()` que:
   - Lee la **plantilla** (`DefaultClosingShift`) o **overrides** de cada semana
     (`WeekOverride` + `ClosingShift`).
   - Aplica `AgendaBlock` (vacaciones / festivos).
   - Cruza con eventos de Calendar (`listEvents`) y descarta huecos ocupados.
   - Devuelve los slots desde **24h vista** hasta **20 días** adelante.

3. Cliente agrupa por día (en TZ del usuario), muestra "esta semana" + "ver más
   fechas". Usuario elige hueco.

4. Pulsa "Confirmar reserva" → `POST /api/agenda/book` con TODOS los campos.
   Backend:
   - Re-valida disponibilidad (`listEvents` en el rango exacto para evitar race).
   - Crea evento Calendar con Meet (`createEventWithMeet`, attendees:
     lead + cohosts del equipo).
   - Llama a `whoseSlot(startDate)` → devuelve `closerId` según el patrón
     semanal del calendario.
   - Crea Lead en BD con `status="scheduled"`, `source="landing"`,
     `meetingUrl`, `googleEventId`, `closerId`.
   - Llama a `notifySetters({ type: "lead_new", leadId, ... })` que crea
     `TeamNotification` con `targetRole: "setter"`.
   - Devuelve `{ ok: true, leadId }`.

5. Cliente redirige a `/agenda/gracias?lead=X&start=ISO&name=Carlos`. Esta
   página muestra el vídeo de YouTube de preparación + pasos + política de
   cancelación. Copy editable desde Biblioteca.

### 4.2 Setter (presentar al closer)

1. Setter entra a `/fisio/leads`. Backend filtra `status="scheduled",
   setterNotifiedAt: null`. Si el setter es manager con filtro `?closer=ID`,
   filtra por ese closer.

2. Para cada lead ve: nombre, contacto, fecha/hora cita, closer asignado, link
   de Meet, resumen del cuestionario.

3. Pulsa "✓ Avisado" → `POST /api/leads/{id}/mark-setter-notified`. Backend:
   - Marca `lead.setterNotifiedAt = now`.
   - Crea `TeamNotification` con `targetProfessionalId: closerId,
     type: "lead_assigned"`.
   - El lead desaparece de su panel.

### 4.3 Closer (workflow comercial)

1. Closer entra a `/fisio/llamadas-venta`. Tabs por status (Agendadas / Ganadas /
   Perdidas / Cancelladas / No-show). Si es CEO, filtra por closer.

2. Para cada lead en "Agendadas" ve los pasos:
   - **Caso de éxito** → "Marcar contactado" (`mark-closer-contacted`).
   - **Recordatorio día anterior** → "Recordatorio enviado" (`mark-reminder-sent`).
   - **Llamada** → marca won/lost/no_show.

3. Si **won**: pulsa "Generar link de pago" → `POST /api/leads/{id}/generate-
   payment-link` (NO incluido en este bundle — depende del módulo Sale + Stripe).

4. Si **lost**: opcional "Pasar a follow-up" → marca `inFollowUp=true` y
   autorellena las 4 fechas (24h, 48-72h, 30d, 90d). El lead aparece en la
   vista FollowUpView (también no incluida; es una sub-vista de CallsListView).

### 4.4 Plantilla de horarios (CEO)

El CEO mantiene una **plantilla por defecto** (`DefaultClosingShift`) que
indica, para cada día de la semana, qué franjas horarias cubren qué closers
(con duración de slot en minutos). Ejemplo:
- L 18:00-20:00 → Alba (60min/slot)
- M 09:00-13:00 → Carla (60min/slot)
- etc.

Para una **semana concreta** puede sobreescribir creando `WeekOverride
useDefault=false` + insertando `ClosingShift` específicos. La UI (no incluida
en este bundle, está en otra ruta) clona los defaults al editar.

Los **bloqueos** (`AgendaBlock`) son días/franjas concretas indisponibles
(vacaciones, festivos). La landing los descarta automáticamente.

---

## 5. Guía de adaptación a NUTRICIÓN

### 5.1 Cambios en el SCHEMA

Los modelos casi no necesitan tocarse. Lo único que conviene:

- **Renombrar campo `impactoCrossfit`** → algo más neutro como `impactoVidaDiaria`
  o `objetivoNutricional`. Es solo texto libre.
- **`motivo` y `tratamientosPrevios`** se pueden mantener tal cual (son labels
  textuales). En nutrición serían:
  - `motivo`: "¿Qué te trae aquí?" (pérdida de grasa, ganancia muscular, etc.)
  - `tratamientosPrevios`: "¿Qué has probado antes?" (dietas, suplementación, etc.)
- El resto del schema (Lead, shifts, notifications) es **idéntico**.

### 5.2 Cambios en COPY

Toda la copy de las landings está en `lib/landing-content.ts` en los objetos:
- `AGENDA_LANDING_DEFAULTS` (hero, autoridad, stats, bloques).
- `AGENDA_GRACIAS_DEFAULTS` (post-reserva: vídeo, pasos, política).

Reescribir esos defaults para nutrición. Después el CEO puede editarlos en
runtime desde la Biblioteca (gracias a `LandingConfig`).

Texto que sí está hardcodeado en el componente y hay que cambiar:
- `components/AgendaLanding.tsx`:
  - Label "¿Cómo te afecta en tu CrossFit?" → "¿Cómo te afecta en tu día a
    día / entrenamiento?"
  - Placeholders del paso 1.
- `components/AgendaGracias.tsx`:
  - Texto "videoconsulta gratuita de valoración" (varias veces).

### 5.3 Cambios en EVENTOS de Calendar

`lib/googleCalendar.ts`:
- Constante `TEAM_COHOSTS` dentro de `createEventWithMeet`: cambia los emails.
- Título del evento: `FisioFit Call · {fullName}` → `Nutri Call · {fullName}`.
- Descripción: bloque "Cuestionario previo" — actualizar los labels.

`app/api/agenda/book/route.ts`:
- Constructor de la `description` (línea ~103) — cambiar nombre marca y labels.
- `actionUrl: "/fisio/llamadas-venta"` → `/equipo/llamadas-venta` o como se
  llame en la app de nutrición.

### 5.4 Roles

Si en la app de nutrición se quieren mantener los 5 roles (ceo, head_success,
nutricionista, setter, closer), no hay nada que cambiar en el schema. El
role "fisio" → "nutricionista" en el código está solo en checks tipo
`user.role === "fisio"`. Buscar y reemplazar globalmente.

Si se reduce el equipo a 3 roles (ceo, nutricionista, setter), hay que adaptar
las redirecciones en `app/fisio/leads/page.tsx` y `app/fisio/llamadas-venta/page.tsx`.

### 5.5 Rutas y branding

- `/agenda` → puede mantenerse igual o pasar a `/llamada` / `/consulta`.
- `/fisio/leads` → `/equipo/leads`.
- `/fisio/llamadas-venta` → `/equipo/llamadas`.
- Logos, favicon, colores (Tailwind config).

### 5.6 Notificaciones

`lib/notifications.ts` está completo y se reutiliza tal cual. Solo asegurar
que `lib/notification-types.ts` (no incluido) registre los tipos:
- `lead_new`
- `lead_assigned`
- `call_reminder`

---

## 6. Checklist de instalación

- [ ] Copiar `code/` al proyecto Next.js destino respetando rutas.
- [ ] Implementar los módulos no incluidos:
  - `lib/prisma.ts` (`export const prisma = new PrismaClient()`).
  - `lib/session.ts` con `getActiveProfessional()` (cookies firmadas).
  - `lib/encryption.ts` (AES-256-GCM).
  - `lib/googleOAuth.ts` (`refreshAccessToken`).
  - `lib/notification-types.ts` con la lista de tipos válidos.
- [ ] Añadir al schema completo del proyecto los modelos de
  `prisma/schema-relevant.prisma` (cuidado con relaciones a `Patient` y
  `Sale` que se comentaron — descomentar cuando esos modelos existan).
- [ ] `npx prisma db push` o `migrate dev`.
- [ ] Configurar Google Cloud Project + OAuth (calendar scope) y guardar
  credenciales en env vars.
- [ ] Implementar `app/api/google/oauth/start` y `app/api/google/oauth/callback`
  para que el CEO pueda conectar Calendar desde la UI (NO incluido aquí).
- [ ] Crear datos iniciales:
  - 1 Professional con role="ceo".
  - 1 Professional con role="setter".
  - 1+ Professional con role="closer".
  - Algunas `DefaultClosingShift` cubriendo horario de atención.
- [ ] Reescribir defaults en `lib/landing-content.ts` para nutrición.
- [ ] Renombrar `impactoCrossfit` → `impactoVidaDiaria` en schema, API y form
  (buscar y reemplazar global).
- [ ] Cambiar emails en `TEAM_COHOSTS` (lib/googleCalendar.ts).
- [ ] Probar el flujo end-to-end: visitar `/agenda` → reservar → verificar
  evento creado en Calendar y notificación en la campanita del setter.

---

## 7. Notas finales

- Toda la lógica de fechas usa **Europe/Madrid** explícitamente
  (`Intl.DateTimeFormat` con `timeZone`). Es TZ-safe ante DST y servidor en UTC.
- El cron de `call_reminder` (notificación del día anterior a la llamada al
  closer) **NO está incluido** aquí — usar Vercel Cron / similar disparando
  `POST /api/cron/call-reminders` (no incluido). Lógica: buscar leads con
  `callScheduledAt` mañana, `status="scheduled"`, sin `reminderSentAt`, y
  crear `TeamNotification` con `refKey="call_reminder:${leadId}"` para
  deduplicar.
- La validación cliente del formulario está duplicada en el frontend para UX,
  pero la canónica está en el backend (`/api/agenda/book`).
- El bundle NO incluye:
  - Login / sesiones (cookies firmadas + bcrypt).
  - Stripe (Sale + payment links + webhook).
  - UI del CEO para editar horarios.
  - UI de la Biblioteca para editar copy de landings.

Pregunta a la otra terminal si necesita alguno de esos — puedo exportarlos
también.
