# Export · Pestaña Comunidad

Este bundle contiene **toda la pestaña Comunidad** de FisioFit Team. Está
pensado para que otra terminal (otro Claude/dev) la replique en un proyecto
Next.js limpio o la integre en uno en curso.

La pestaña agrupa **dos subsistemas independientes** que comparten ruta:

1. **Classroom** estilo Skool — cursos con secciones y lecciones de vídeo,
   con progreso por paciente y barra de avance.
2. **Muro social** — feed de posts (texto/imagen/vídeo) con comentarios y
   reacciones. El autor puede ser un miembro del equipo o un paciente.

Existe también un tercer bloque, el **calendario editorial interno** del
equipo (modelo `CommunityPost`), que vive en la misma área de navegación
pero **no se enseña al paciente**. Lo incluyo en el bundle por completitud
pero puedes ignorarlo si tu app no necesita esa parte.

---

## 0. Visión funcional

```
┌──────────────────────────────────────────────────────────┐
│ EQUIPO  (/fisio/comunidad)                               │
│  ┌─────────────────────┬───────────────────────────────┐  │
│  │ 🎓 Classroom        │ 💬 Muro                       │  │
│  │ Crea cursos,        │ Crea posts, modera,          │  │
│  │ secciones, lecciones│ contesta comentarios          │  │
│  └─────────────────────┴───────────────────────────────┘  │
│                                                            │
│  /fisio/comunidad/curso/[id]  → editor del curso          │
│  /fisio/comunidad/plan        → calendario editorial      │
│                                  interno (CommunityPost)  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ PACIENTE  (/paciente/[id]/comunidad)                     │
│  ┌─────────────────────┬───────────────────────────────┐  │
│  │ 🎓 Cursos           │ 💬 Muro                       │  │
│  │ Lista de módulos    │ Feed de posts del equipo y    │  │
│  │ con % completado    │ otros atletas. Like/comentar  │  │
│  │ Click → vídeos      │ Crear post propio             │  │
│  └─────────────────────┴───────────────────────────────┘  │
│                                                            │
│  /paciente/[id]/comunidad/curso/[courseId]                │
│        → reproductor de lecciones del curso               │
└──────────────────────────────────────────────────────────┘
```

---

## 1. Stack y dependencias

- **Next.js 14** App Router (RSC + client components).
- **Prisma 5.22** con Postgres (Neon en prod, SQLite en dev).
- **Tailwind CSS** + estilos inline (no shadcn/ui).
- **@vercel/blob** para subida de imágenes (`/api/community/upload`).
- **lucide-react** para iconos.
- **TypeScript strict**.

Dependencias mínimas:

```json
{
  "dependencies": {
    "next": "^14",
    "react": "^18",
    "react-dom": "^18",
    "@prisma/client": "^5.22",
    "@vercel/blob": "^2",
    "lucide-react": "^0.400"
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

## 2. Variables de entorno

```bash
DATABASE_URL="postgresql://..."
BLOB_READ_WRITE_TOKEN="vercel_blob_..."   # token de @vercel/blob
SESSION_SECRET="<32+ bytes>"
```

---

## 3. Mapa de archivos del bundle (`code/`)

### Esquema
- `prisma/schema-relevant.prisma` — modelos Patient/Professional (slim),
  CommunityModule, CommunitySection, CommunityLesson,
  CommunityLessonProgress, CommunityFeedPost, CommunityComment,
  CommunityReaction, CommunityPost, CommunityIdea.

### Páginas del equipo
- `app/fisio/comunidad/page.tsx` — landing con Classroom + Muro (server).
- `app/fisio/comunidad/curso/[id]/page.tsx` — editor del curso (secciones
  + lecciones).
- `app/fisio/comunidad/plan/page.tsx` — calendario editorial interno
  (CommunityPost). **Opcional.**

### Páginas del paciente
- `app/paciente/[id]/comunidad/page.tsx` — feed + lista de cursos con
  progreso.
- `app/paciente/[id]/comunidad/curso/[courseId]/page.tsx` — reproductor de
  lecciones del curso.

### Componentes (importan utilidades de lib/)
- `components/CommunityManager.tsx` — UI del equipo (Classroom + Muro)
  con tabs internas.
- `components/PatientCommunity.tsx` — UI del paciente equivalente.
- `components/CommunityView.tsx` — calendario editorial interno (opcional).
- `components/CommunityNav.tsx` — subnav del área de comunidad del equipo.

### APIs
- `app/api/community/modules/route.ts` — CRUD cursos.
- `app/api/community/modules/[id]/route.ts`
- `app/api/community/sections/route.ts` — CRUD secciones.
- `app/api/community/sections/[id]/route.ts`
- `app/api/community/lessons/route.ts` — CRUD lecciones.
- `app/api/community/lessons/[id]/route.ts`
- `app/api/community/lessons/[id]/complete/route.ts` — paciente marca
  lección como completada.
- `app/api/community/feed/route.ts` — listar/crear posts del muro.
- `app/api/community/feed/[id]/route.ts` — editar/borrar post.
- `app/api/community/feed/[id]/comments/route.ts` — crear comentario.
- `app/api/community/feed/[id]/react/route.ts` — toggle like.
- `app/api/community/upload/route.ts` — subida de imagen a Vercel Blob.
- `app/api/community/posts/route.ts` — CRUD del calendario editorial.
- `app/api/community/ideas/route.ts` — CRUD del banco de ideas.

### Helpers (`lib/`)
- `lib/community.ts` — categorías y constantes del calendario editorial.
- `lib/community-feed.ts` — categorías del muro social.
- `lib/community-actor.ts` — clave: resuelve el "actor" actual
  (Patient o Professional) para autoría de posts/comentarios/reacciones.

---

## 4. Conceptos clave

### 4.1 Autor unificado (Patient OR Professional)

El muro social tiene una decisión de diseño importante: cada post,
comentario y reacción pertenece a UN actor que puede ser **un miembro del
equipo (`Professional`)** O **un paciente (`Patient`)**, nunca a los dos.

Esto se modela con **dos FK opcionales** en cada modelo:

```prisma
authorId        String?  // Professional
patientAuthorId String?  // Patient
```

`lib/community-actor.ts` expone `getActiveActor()` que devuelve uno de los
dos según quién esté logueado. La UI muestra:
- `author.fullName ?? patientAuthor.fullName`
- `author.photoUrl ?? patientAuthor.photoUrl`

Y existe un flag `isPatient` derivado para estilizar (badge "Atleta" vs
"Equipo").

**Si tu app solo tiene un tipo de usuario** (p. ej. solo clientes), puedes
simplificar a una sola FK.

### 4.2 Categorías del muro

`lib/community-feed.ts` define las categorías visibles del muro
(`general`, `evolución`, `pregunta`, `recurso`, etc.). Es una constante
exportada; la UI usa esas opciones en el select de "Nuevo post" y en los
badges.

### 4.3 Subida de imagen

`/api/community/upload` recibe `multipart/form-data` con un archivo y lo
sube a **Vercel Blob**. Devuelve la URL pública que se persiste como
`imageUrl` en `CommunityFeedPost`. Reutiliza el mismo endpoint para
portadas de cursos (`coverUrl` en `CommunityModule`).

### 4.4 Progreso del Classroom

`CommunityLessonProgress` (única por `[lessonId, patientId]`) registra
qué lecciones ha completado un paciente. La barra del curso es:

```
completadas = lecciones de esas secciones marcadas en progress
total       = lecciones totales del curso
% avance    = completadas / total
```

El paciente la marca con `POST /api/community/lessons/[id]/complete`.

### 4.5 Badge de novedades

`Patient.communityLastSeenAt` se actualiza cuando el paciente entra a
`/paciente/[id]/comunidad`. La home del paciente cuenta:

```ts
unread = newPostsCount + newCommentsCount + newReactionsCount
```

filtrando por `createdAt > communityLastSeenAt` y excluyendo los propios
del paciente. Si > 0 muestra un punto rojo en el item "Comunidad" del
menú inferior.

---

## 5. Flujos detallados

### 5.1 Creación de un curso (equipo)

1. Manager entra a `/fisio/comunidad` → tab Classroom.
2. Pulsa "+ Nuevo curso" → modal: título, descripción, portada (subida a
   Vercel Blob), `published`.
3. POST `/api/community/modules` → crea `CommunityModule`.
4. Click en la tarjeta del curso → `/fisio/comunidad/curso/[id]` (editor).
5. Añade secciones (`CommunitySection`) y dentro lecciones
   (`CommunityLesson`) con título, descripción, `videoUrl` (YouTube/Vimeo).
6. Order drag&drop por dnd-kit (no incluido en el bundle, es trivial).

### 5.2 Paciente ve y completa una lección

1. Entra a `/paciente/[id]/comunidad` → tab Cursos.
2. Ve las tarjetas con `% completado`.
3. Click → `/paciente/[id]/comunidad/curso/[courseId]`.
4. Reproduce el vídeo embebido. Pulsa "Marcar completada".
5. POST `/api/community/lessons/[id]/complete` → crea
   `CommunityLessonProgress`.

### 5.3 Publicar en el muro

Cualquier actor (paciente o equipo) puede publicar:

1. `/paciente/[id]/comunidad` o `/fisio/comunidad` → tab Muro.
2. Botón "Publicar". Modal: categoría, título, body, imagen (opcional),
   vídeo URL (opcional).
3. POST `/api/community/feed` → `getActiveActor()` resuelve quién es y
   guarda `authorId` o `patientAuthorId`.

### 5.4 Like / comentario

- Like: POST `/api/community/feed/[id]/react` → toggle (crea o borra
  `CommunityReaction` con el mismo actor).
- Comentario: POST `/api/community/feed/[id]/comments` → crea
  `CommunityComment`.

---

## 6. Guía de adaptación

### 6.1 Adaptación mínima

Si tu app tiene **un solo tipo de usuario** (p. ej. cliente / atleta /
suscriptor) en vez de Patient + Professional:

1. **Schema**: borra los campos `authorId`/`professionalId` y deja solo el
   FK al modelo de usuario que tengas. Renómbralo si quieres
   (`userId String`).
2. **`lib/community-actor.ts`**: simplifica `getActiveActor()` para que
   devuelva siempre el usuario logueado de tu sistema.
3. **UI** (`CommunityManager`, `PatientCommunity`): quita la lógica que
   diferencia `isPatient` para badges/colores. Todo es "Usuario".
4. **APIs**: borra las comprobaciones de rol específicas de FisioFit
   (`user.role === "ceo"`, etc.).

### 6.2 Adaptación recomendada

Aunque solo tengas un tipo de usuario, **considera mantener la distinción
entre EQUIPO y CLIENTE** (con un campo `role: "admin" | "client"` en tu
modelo de usuario):

- Solo el equipo crea cursos / lecciones.
- Solo el equipo modera el muro (borrar posts ajenos).
- El cliente puede publicar, comentar, reaccionar y completar lecciones.

Esto se ajusta a tu app de nutrición (admin = nutricionista, cliente =
atleta) sin tocar la estructura de la comunidad.

### 6.3 Branding / categorías

- `lib/community.ts` y `lib/community-feed.ts` exponen las categorías como
  arrays de objetos `{ value, label, color }`. Edita esas listas según tu
  vertical (p. ej. para nutrición: "receta", "consejo", "antes/después",
  "pregunta", "logro").

### 6.4 Subida de imagen sin Vercel Blob

Si no usas Vercel, reemplaza `app/api/community/upload/route.ts` con tu
proveedor (S3, R2, Supabase Storage). El contrato es:

```ts
// Recibe multipart/form-data con campo "file"
// Devuelve { url: string }
```

El resto del bundle no necesita cambios.

### 6.5 Rutas

- `/fisio/comunidad` y `/paciente/[id]/comunidad` están atadas a la
  semántica de FisioFit. En tu app probablemente quieras:
  - `/equipo/comunidad` o `/admin/comunidad`
  - `/app/comunidad` o `/clientes/[id]/comunidad`

Cambia los `redirect` / `Link href` consistentemente.

---

## 7. Lo que NO está incluido

- **Notificaciones in-app** del muro (cuando alguien comenta tu post).
  En FisioFit se gestionan via el sistema general de `TeamNotification` /
  `PatientNotification`, fuera del scope de este bundle.
- **Drag&drop** para reordenar secciones/lecciones. Es trivial con
  `@dnd-kit/core`; copia el patrón de cualquier editor del proyecto.
- **`lib/prisma.ts`**, **`lib/session.ts`** (sesiones de usuario),
  **`lib/auth.ts`**: son helpers genéricos del proyecto que dependen de
  tu sistema de auth.

---

## 8. Checklist de instalación

- [ ] Copiar `code/` al proyecto Next.js destino respetando rutas
      (o renombrarlas según tu convención).
- [ ] Mergear los modelos de `prisma/schema-relevant.prisma` con tu
      schema (ajustando FKs si solo tienes un tipo de usuario).
- [ ] `npx prisma db push` o `migrate dev`.
- [ ] Implementar `lib/session.ts` con `getActiveActor()` adaptado a tu
      modelo de usuario.
- [ ] Configurar Vercel Blob (o tu storage equivalente).
- [ ] Crear seeders / datos de prueba:
      - 1 curso con 2 secciones, cada una con 2-3 lecciones.
      - 2-3 posts en el muro (uno del equipo, uno de un cliente).
- [ ] Adaptar categorías del muro (`lib/community-feed.ts`) y del
      calendario editorial (`lib/community.ts`).
- [ ] Probar end-to-end:
      - Cliente entra a `/comunidad` → ve cursos + feed.
      - Marca una lección como completada → barra avanza.
      - Publica un post → aparece para el equipo.
      - Equipo borra/edita un post → desaparece en el cliente.

---

## 9. Notas finales

- Toda la UI usa **Tailwind** + estilos inline. Es estética FisioFit; si
  tu app tiene branding distinto, los colores principales son
  `#FCD34D` (amarillo accent), `#0A0A0A` (negro), `#FAFAFA` (blanco
  off-white). Cambia esos tres y prácticamente la app es de otra marca.
- Las páginas son **server components** que pasan datos serializados a
  componentes `"use client"`. Mantén ese patrón.
- El bundle es autocontenido para la pestaña Comunidad. Si necesitas
  cosas externas (sesión, auth, Patient/Professional model), me lo
  pides y lo exporto también.

Pregunta a la otra terminal si necesita alguna de estas piezas extra
antes de empezar.
