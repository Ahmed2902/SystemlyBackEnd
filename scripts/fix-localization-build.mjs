import fs from "node:fs";

function update(file, transform) {
  const source = fs.readFileSync(file, "utf8");
  const next = transform(source);
  if (next !== source) fs.writeFileSync(file, next);
  console.log(`${next !== source ? "updated" : "unchanged"} ${file}`);
}

update("src/modules/auth/auth.schema.ts", (source) =>
  source.replace(".regex(egyPhone,", ".regex(egyptPhone,"),
);

update("src/modules/auth/auth.service.ts", (source) =>
  source.replace(
    "        preferredLanguage,\n        role: Roles.User,",
    '        preferredLanguage: preferredLanguage ?? "en",\n        role: Roles.User,',
  ),
);

update("src/workers/email.worker.ts", (source) =>
  source
    .replace(
      '        const name = data.name || appt?.customer?.name || "there";',
      '        const name = String(data.name ?? appt?.customer?.name ?? "there");',
    )
    .replace(
      '        const businessName = data.businessName || appt?.business?.name || "";',
      '        const businessName = String(data.businessName ?? appt?.business?.name ?? "");',
    )
    .replace(
      '        const serviceName =\n          data.serviceName ||\n          appt?.appointmentServices?.[0]?.service?.name ||\n          "";',
      '        const serviceName = String(\n          data.serviceName ??\n            appt?.appointmentServices?.[0]?.service?.name ??\n            "",\n        );',
    )
    .replace(
      '        const startsAt =\n          data.startsAt || (appt?.startsAt ? appt.startsAt.toISOString() : "");',
      '        const startsAt = String(\n          data.startsAt ?? (appt?.startsAt ? appt.startsAt.toISOString() : ""),\n        );',
    ),
);
