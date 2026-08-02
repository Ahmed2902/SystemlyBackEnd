import fs from "node:fs";

const file = "src/workers/email.worker.ts";
const source = fs.readFileSync(file, "utf8");
const next = source.split("noreply@hgezli.com").join("noreply@systemly.app");
if (next !== source) fs.writeFileSync(file, next);
console.log(next !== source ? `updated ${file}` : `${file} already uses Systemly branding`);
