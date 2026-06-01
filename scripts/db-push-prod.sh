#!/usr/bin/env bash
# Aplica el schema de Prisma a Neon (producción) y restaura el schema dev.
#
# Lee DATABASE_URL de `.env.production.local` (gitignored). Crea ese archivo
# una vez con la URL de Neon y olvídate; cada migración futura es:
#
#   npm run db:push:prod
#
# Cómo funciona internamente:
#  - El `.env` de raíz tiene la URL de SQLite dev y machaca a Prisma. Como
#    `prisma db push` de esta versión no soporta --url, lo que hacemos es
#    intercambiar `.env` por uno temporal con la URL de prod justo durante
#    el push, y restaurar el original al final (con `trap`, incluso si
#    falla). Es transparente desde fuera.

set -euo pipefail

ENV_FILE=".env.production.local"
ENV_REAL=".env"
ENV_BAK=".env.devdb.bak"

if [ ! -f "$ENV_FILE" ]; then
  cat <<EOF
❌ Falta $ENV_FILE.

Crea ese archivo con tu DATABASE_URL de Neon, p.ej.:
  DATABASE_URL="postgresql://..."
(está en .gitignore, no se sube al repo)
EOF
  exit 1
fi

# Extraer DATABASE_URL del archivo (acepta comillas dobles/simples opcionales)
URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
URL="${URL%\"}"
URL="${URL#\"}"
URL="${URL%\'}"
URL="${URL#\'}"

if [ -z "$URL" ]; then
  echo "❌ DATABASE_URL no encontrada (o vacía) en $ENV_FILE"
  exit 1
fi

# Cleanup garantizado: restaurar schema dev y .env original aunque algo falle.
cleanup() {
  if [ -f "$ENV_BAK" ]; then
    mv "$ENV_BAK" "$ENV_REAL"
  fi
  node scripts/use-schema.js dev >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "📦 Cambiando a schema prod..."
node scripts/use-schema.js prod

echo "🔄 Intercambiando .env temporalmente..."
if [ -f "$ENV_REAL" ]; then
  mv "$ENV_REAL" "$ENV_BAK"
fi
echo "DATABASE_URL=\"$URL\"" > "$ENV_REAL"

echo "🚀 Aplicando schema a Neon..."
npx prisma db push --skip-generate

echo "↩️  Restaurando .env original..."
mv "$ENV_BAK" "$ENV_REAL"

echo "🔁 Volviendo a schema dev..."
node scripts/use-schema.js dev
trap - EXIT

echo "🔧 Regenerando cliente Prisma..."
# Puede fallar por Json/SQLite; no bloqueamos.
npx prisma generate || echo "(prisma generate falló — esperado en dev con campos Json. No es crítico.)"

echo "✅ Listo."
