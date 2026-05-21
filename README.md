# FisioFit App

App interna para FisioFit Team: gestión de pacientes online, contenido para Instagram, ventas, CRM y banco de recursos.

## Stack

- **Next.js 14** (App Router)
- **TypeScript** + **Tailwind CSS**
- **Prisma** ORM
- **SQLite** en desarrollo / **PostgreSQL** en producción
- **Resend** para emails transaccionales
- Hosting: **Vercel**, BD: **Neon**

## Desarrollo local

### Requisitos
- Node.js 20+
- npm

### Setup primera vez

```bash
npm install
npm run setup     # crea SQLite + carga seed con datos demo
npm run dev       # arranca http://localhost:3000
```

El `.env` por defecto tiene `FISIO_DEV_BYPASS="true"` → la app NO pide login en local, muestra la pantalla "switch user" para trastear rápido.

### Comandos útiles

```bash
npm run dev                    # arranca dev server
npm run setup                  # resetea BD + seed (cuidado: borra todo)
npm run db:studio              # GUI de Prisma para ver la BD
npm run db:seed                # solo seed (sin resetear schema)
npm run schema:dev             # vuelve al schema SQLite (si tocaste para prod)
npm run schema:prod            # cambia al schema Postgres (raro hacerlo en local)
```

## Despliegue a producción

### Servicios

- **Neon** (BD Postgres) — region Frankfurt
- **Resend** (emails) — dominio `fisiofitteam.com` verificado
- **Vercel** (hosting) — conectado al repo
- **GitHub** — repo privado

### Variables de entorno en Vercel

Ver `.env.production.example`. Críticas:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Connection string de Neon (pooled) |
| `NEXT_PUBLIC_BASE_URL` | `https://app.fisiofitteam.com` |
| `RESEND_API_KEY` | `re_...` |
| `EMAIL_FROM` | `FisioFit App <noreply@fisiofitteam.com>` |
| `FISIO_DEV_BYPASS` | `false` (¡importante!) |

### Primera vez: setup en Neon

Después del primer deploy de Vercel, ejecutar UNA vez la migración del schema desde local:

```bash
DATABASE_URL="postgresql://...neon.tech..." npm run db:push:prod
```

Bootstrappear el primer CEO:

```bash
DATABASE_URL="postgresql://...neon.tech..." \
  NEXT_PUBLIC_BASE_URL="https://app.fisiofitteam.com" \
  RESEND_API_KEY="re_..." \
  ADMIN_EMAIL="tucorreo@fisiofitteam.com" \
  ADMIN_NAME="Tu Nombre" \
  npm run bootstrap:admin
```

Recibirás el email de "establece tu contraseña" → entras como CEO → vas a `/fisio/equipo` → invitas al resto.

### Despliegues posteriores

Cualquier `git push` a `main` triggerea deploy automático en Vercel. El build:
1. `node scripts/use-schema.js prod` (cambia schema a Postgres)
2. `prisma generate` (genera cliente)
3. `next build` (compila la app)

**Cambios de schema**: si una versión modifica `schema.production.prisma`, después del deploy hay que aplicar la migración a Neon:
```bash
DATABASE_URL="postgresql://...neon.tech..." npm run db:push:prod
```

## Estructura

```
app/                    # Páginas (App Router)
  fisio/                # Dashboard del equipo
  paciente/             # App del paciente
  login/                # Login equipo
  paciente/login/       # Login paciente
  api/                  # Endpoints
components/             # Componentes React
lib/                    # Utilidades
prisma/
  schema.prisma         # Schema activo
  schema.production.prisma
  seed.ts
  bootstrap-admin.ts
scripts/
  use-schema.js
public/                 # Assets estáticos
```

## Seguridad

- Nunca commitear `.env`, ni connection strings, ni API keys
- Variables sensibles solo en Vercel → Settings → Environment Variables
- `FISIO_DEV_BYPASS` debe estar a `false` en producción siempre
