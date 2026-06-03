#!/usr/bin/env bash
# Wrapper para correr scripts/reset-prelaunch.ts contra la BD de producción
# (Neon), reutilizando .env.production.local como hace db-push-prod.sh.
#
# Uso:
#   bash scripts/reset-prelaunch.sh                 → DRY-RUN (no toca nada)
#   bash scripts/reset-prelaunch.sh --apply         → BORRA DE VERDAD
#                                                      (requiere CONFIRM=YES_DELETE_ALL)
#
# Atajos:
#   npm run reset:prelaunch                         → dry-run
#   npm run reset:prelaunch -- --apply              → apply
#
# El script swap-ea .env temporalmente para que Prisma use la URL de Neon,
# y lo restaura al final pase lo que pase (trap EXIT).

set -euo pipefail

ENV_FILE=".env.production.local"
ENV_REAL=".env"
ENV_BAK=".env.devdb.bak"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Falta $ENV_FILE con DATABASE_URL de Neon."
  exit 1
fi

URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
URL="${URL%\"}"
URL="${URL#\"}"
URL="${URL%\'}"
URL="${URL#\'}"

if [ -z "$URL" ]; then
  echo "❌ DATABASE_URL no encontrada (o vacía) en $ENV_FILE"
  exit 1
fi

cleanup() {
  if [ -f "$ENV_BAK" ]; then
    mv "$ENV_BAK" "$ENV_REAL"
  fi
  node scripts/use-schema.js dev >/dev/null 2>&1 || true
  # Re-generamos el cliente con schema dev al salir; puede fallar por Json
  # en SQLite, no es bloqueante.
  npx prisma generate >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "📦 Cambiando a schema prod (Postgres) para generar cliente correcto..."
node scripts/use-schema.js prod

echo "🔄 Intercambiando .env temporalmente para apuntar a Neon..."
if [ -f "$ENV_REAL" ]; then
  mv "$ENV_REAL" "$ENV_BAK"
fi
echo "DATABASE_URL=\"$URL\"" > "$ENV_REAL"

echo "🔧 Regenerando cliente Prisma contra schema prod..."
npx prisma generate

echo "🚀 Ejecutando scripts/reset-prelaunch.ts..."
# Pasa todos los argumentos (--apply, etc.) al script TS.
npx tsx scripts/reset-prelaunch.ts "$@"

echo "↩️  Restaurando .env y schema dev..."
mv "$ENV_BAK" "$ENV_REAL"
node scripts/use-schema.js dev >/dev/null 2>&1 || true
npx prisma generate >/dev/null 2>&1 || true
trap - EXIT

echo "✅ Hecho."
