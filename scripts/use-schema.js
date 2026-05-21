#!/usr/bin/env node
/**
 * Selector de schema Prisma según entorno.
 *
 * Uso:
 *   node scripts/use-schema.js dev    → copia schema.prisma (SQLite) — no hace nada porque es el por defecto
 *   node scripts/use-schema.js prod   → copia schema.production.prisma → schema.prisma
 *
 * Pensado para ejecutarse antes de `prisma generate` o `prisma migrate deploy` en Vercel.
 *
 * Para volver al schema local (SQLite) después de haber tocado para prod:
 *   node scripts/use-schema.js dev
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ACTIVE = path.join(ROOT, "prisma", "schema.prisma");
const DEV = path.join(ROOT, "prisma", "schema.dev.prisma");
const PROD = path.join(ROOT, "prisma", "schema.production.prisma");

const target = process.argv[2];

if (!target || (target !== "dev" && target !== "prod")) {
  console.error("❌ Uso: node scripts/use-schema.js [dev|prod]");
  process.exit(1);
}

if (target === "prod") {
  if (!fs.existsSync(PROD)) {
    console.error(`❌ No existe ${PROD}`);
    process.exit(1);
  }
  // Si no existe el backup dev, lo creamos para poder volver
  if (!fs.existsSync(DEV)) {
    fs.copyFileSync(ACTIVE, DEV);
    console.log(`📦 Backup creado: ${path.relative(ROOT, DEV)}`);
  }
  fs.copyFileSync(PROD, ACTIVE);
  console.log("✅ Schema activo = production (Postgres)");
} else {
  if (!fs.existsSync(DEV)) {
    console.error(`❌ No existe ${DEV}. Probablemente nunca cambiaste a prod, así que ya estás en dev.`);
    process.exit(0);
  }
  fs.copyFileSync(DEV, ACTIVE);
  console.log("✅ Schema activo = dev (SQLite)");
}
