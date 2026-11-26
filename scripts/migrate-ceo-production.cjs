// The existing Vercel production database only. Never sync the full Prisma schema.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
if (process.env.VERCEL_ENV !== "production") {
  console.log("CEO additive migration skipped outside Vercel production");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("CEO additive migration: configured DATABASE_URL unavailable");
  process.exit(1);
}
const root = path.resolve(__dirname, "..");
const names = ["grok-ceo-exchange.sql", "business-expense-candidate.sql"];
// Both files are controlled additive migrations, each with its own explicit
// transaction. Wrap the complete migration in one transaction instead.
const statements = names.map(name => fs.readFileSync(path.join(__dirname, "sql", name), "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));
const result = spawnSync("prisma", ["db", "execute", "--schema", "prisma/schema.prisma", "--stdin"], {
  cwd: root, input: "BEGIN;\n" + statements.join("\n") + "\nCOMMIT;\n", encoding: "utf8", timeout: 90000,
});
if (result.status !== 0) {
  // Never print connection URLs or CLI error text containing credentials.
  const code = (result.stderr || "").match(/\bP\d{4}\b/)?.[0] || "unknown";
  console.error("CEO additive migration failed (Prisma " + code + "); existing production deployment remains unchanged.");
  process.exit(1);
}
console.log("CEO additive migration applied successfully");
