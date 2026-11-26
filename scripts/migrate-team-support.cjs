const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
if (process.env.VERCEL_ENV !== "production") {
  console.log("Team support migration skipped outside Vercel production");
  process.exit(0);
}
if (!process.env.DATABASE_URL) process.exit(1);
const result = spawnSync("prisma", ["db", "execute", "--schema", "prisma/schema.prisma", "--stdin"], {
  cwd: path.resolve(__dirname, ".."), input: fs.readFileSync(path.join(__dirname, "sql/team-support.sql"), "utf8"),
  encoding: "utf8", timeout: 90000,
});
if (result.status !== 0) {
  console.error("Team support migration failed; existing production deployment remains unchanged.");
  process.exit(1);
}
console.log("Team support additive migration applied");
