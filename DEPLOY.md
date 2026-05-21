# 🚀 Guía: primer despliegue a producción

Esta guía te lleva desde "tengo el zip" hasta "la app está viva en `app.fisiofitteam.com`". Sigue los pasos en orden.

⏱ Tiempo estimado: **60-90 minutos** la primera vez (la verificación DNS de Resend es lo más lento).

---

## ANTES DE EMPEZAR

Necesitas tener ya creadas las cuentas en:
- ✅ Neon (proyecto `fisio-app`)
- ✅ Resend (dominio `fisiofitteam.com` en proceso o ya verificado)
- ✅ GitHub (repo privado `fisiofitteam/fisio-app` vacío)
- ✅ Vercel (cuenta conectada a GitHub)

---

## PASO 1 — Subir el código a GitHub (5 min)

Abre terminal en la carpeta del proyecto:

```bash
cd ~/Documents/fisio-app
```

**Importante**: borra los artefactos locales antes de subir, no queremos que `node_modules`, `dev.db` ni `.next` viajen al repo:

```bash
rm -rf node_modules .next prisma/dev.db prisma/dev.db-journal
```

Inicializar git y conectar al repo:

```bash
git init
git add .
git commit -m "Primer commit: app funcional + auth + módulos completos"
git branch -M main
git remote add origin https://github.com/fisiofitteam/fisio-app.git
git push -u origin main
```

Si te pide login de GitHub: usa **personal access token** en vez de contraseña (GitHub ya no acepta contraseñas para push). Cómo crearlo:
- GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)
- Permisos: marca `repo` (todo el bloque)
- Genera → cópialo → cuando git pida "Password", pega el token

Verifica que se subió todo entrando a https://github.com/fisiofitteam/fisio-app — deberías ver los archivos.

---

## PASO 2 — Aplicar el schema a Neon (3 min)

Volvemos a tu terminal local. Vamos a crear las tablas en Neon usando tu connection string.

```bash
cd ~/Documents/fisio-app
npm install
```

Ahora cambia al schema de producción y haz push a Neon. **Reemplaza la URL con tu connection string real**:

```bash
DATABASE_URL="postgresql://neondb_owner:TU_PASSWORD@TU_HOST.neon.tech/neondb?sslmode=require&channel_binding=require" \
  npm run db:push:prod
```

Si todo va bien verás:
```
✅ Schema activo = production (Postgres)
🚀  Your database is now in sync with your Prisma schema.
```

**Ya tienes las tablas en Neon.** Para confirmarlo, ve a https://console.neon.tech → tu proyecto → Tables → deberías ver `Patient`, `Professional`, etc.

Tras esto, vuelve al schema dev en tu repo local para no romper el trasteo:

```bash
npm run schema:dev
```

Esto deja el schema activo en SQLite otra vez.

---

## PASO 3 — Crear el primer CEO en Neon (3 min)

Bootstrappeas tu cuenta de CEO. **Sustituye los datos en mayúsculas por los tuyos**:

```bash
DATABASE_URL="postgresql://neondb_owner:TU_PASSWORD@TU_HOST.neon.tech/neondb?sslmode=require&channel_binding=require" \
RESEND_API_KEY="re_TU_API_KEY" \
NEXT_PUBLIC_BASE_URL="https://app.fisiofitteam.com" \
ADMIN_EMAIL="fisiofitteam@fisiofitteam.com" \
ADMIN_NAME="Ales Faus" \
npm run bootstrap:admin
```

Esto:
1. Crea el profesional con rol CEO en Neon
2. Te envía un email con el link para establecer contraseña (válido 7 días)
3. Imprime el link por consola por si el email tarda

**Si el dominio de Resend AÚN no está verificado**: el email no llegará pero el link sí se imprime en consola. Copia ese link y guárdalo (te servirá en el Paso 6).

---

## PASO 4 — Conectar Vercel al repo (5 min)

1. Entra a https://vercel.com → **Add New...** → **Project**
2. **Import Git Repository** → busca `fisiofitteam/fisio-app` → **Import**
3. Configure Project:
   - **Framework Preset**: Next.js (debería detectarlo solo)
   - **Root Directory**: deja por defecto
   - **Build Command**: deja por defecto (lo lee de `vercel.json`)
4. **Environment Variables** → añade estas 5 (una a una):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Tu connection string de Neon completa |
   | `NEXT_PUBLIC_BASE_URL` | `https://app.fisiofitteam.com` (o el temporal de Vercel si aún no tienes dominio configurado) |
   | `RESEND_API_KEY` | Tu API key de Resend (`re_...`) |
   | `EMAIL_FROM` | `FisioFit App <noreply@fisiofitteam.com>` |
   | `FISIO_DEV_BYPASS` | `false` |

5. **Deploy** → tarda 1-3 minutos

Cuando termine, te da una URL temporal tipo `https://fisio-app-xxxx.vercel.app`. **Anótala**.

---

## PASO 5 — Conectar tu dominio (10-30 min, depende DNS)

En Vercel → tu proyecto → Settings → Domains → **Add**:
- Escribe `app.fisiofitteam.com` → Add

Vercel te pide que añadas un registro CNAME en tu DNS:
```
Tipo:  CNAME
Name:  app
Value: cname.vercel-dns.com
```

Ve al panel donde tienes el dominio `fisiofitteam.com` (Namecheap, Cloudflare, GoDaddy, etc), DNS settings, y añade ese CNAME.

Vercel detecta cuando el DNS propaga (15-30 min normalmente). Una vez verde, **actualiza** la variable `NEXT_PUBLIC_BASE_URL` en Vercel → Settings → Environment Variables para que apunte a `https://app.fisiofitteam.com`. Luego Vercel → Deployments → último deploy → ... → **Redeploy** para que coja la nueva variable.

---

## PASO 6 — Establecer tu contraseña de CEO (2 min)

Abre el link que recibiste en el email del Paso 3 (o el que copiaste de consola).

Si pusiste `app.fisiofitteam.com` ya en `NEXT_PUBLIC_BASE_URL`, el link será:
```
https://app.fisiofitteam.com/reset?token=xxxxx&welcome=1
```

Si todavía estabas con la URL temporal de Vercel, sustituye el dominio en el link manualmente:
```
https://app.fisiofitteam.com/reset?token=xxxxx&welcome=1
```

Estableces tu contraseña → entras como CEO. **Estás dentro.**

---

## PASO 7 — Invitar al equipo (5 min)

Una vez dentro:
1. Sidebar izquierda → **Equipo**
2. **+ Invitar profesional** → para cada miembro:
   - Niki Boykova · `nikiboykova.1997@gmail.com` · Setter
   - Alba Maldonado · `videoconsultas@fisiofitteam.com` · Closer
   - Miguel Castro · `miguelcastro@fisiofitteam.com` · Head of Success
   - Alberto Melis, Sofía Cáliz, Blanca Garrido · sus emails · Fisioterapeuta
3. Cada uno recibirá email con link "Establecer mi contraseña" (válido 7 días)
4. En la tabla los verás como "⏳ Invitación pendiente" hasta que entren

Si en algún momento un email no llega, vuelve a Equipo → **Reenviar** en esa fila.

---

## PASO 8 — Verificar que todo funciona (10 min)

Pruebas en producción:

- [ ] Login con tu email + contraseña → entra al dashboard CEO
- [ ] El sidebar muestra todos los items: Panel, Pacientes, Llamadas, Follow-up, Contenido, Biblioteca, Tareas, Recursos, Finanzas, Equipo
- [ ] Logout → vuelve al `/login`
- [ ] "¿Olvidaste tu contraseña?" → ingresa tu email → recibes email de reset
- [ ] Cierra sesión y vuelve a entrar con la nueva contraseña

Crear un paciente de prueba:
- [ ] Pacientes → "+ Añadir paciente"
- [ ] Pon un email real tuyo (no el del CEO, otro tuyo)
- [ ] Cierra sesión
- [ ] Vete a `/paciente/login` → mete ese email → recibes código → metes código → entras como paciente

---

## ROLLBACK rápido

Si algo se rompe después de un deploy:
1. Vercel → Deployments → la versión anterior que funcionaba → ... → **Promote to Production**
2. En 30 segundos vuelve a estar viva la versión anterior

---

## Listo

A partir de aquí: cada `git push` que yo (Claude) te dé tras un nuevo zip se deploya automático en producción. Tú pruebas, das feedback, iteramos.

Cuando estés listo para abrir a los pacientes piloto: avísame y montamos la PWA + onboarding.
