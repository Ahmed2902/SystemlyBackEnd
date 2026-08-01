import fs from "node:fs";

function update(path, transform) {
  const source = fs.readFileSync(path, "utf8");
  const next = transform(source);
  if (next === source) {
    console.log(`${path} already up to date`);
    return;
  }
  fs.writeFileSync(path, next);
  console.log(`updated ${path}`);
}

function replaceAllRequired(source, before, after, minimum, label) {
  const occurrences = source.split(before).length - 1;
  if (occurrences < minimum) {
    if (source.includes(after)) return source;
    throw new Error(`Expected at least ${minimum} occurrence(s) for ${label}; found ${occurrences}`);
  }
  return source.split(before).join(after);
}

update("src/modules/auth/auth.service.ts", (source) => {
  let next = source;

  next = replaceAllRequired(
    next,
    "{ name: user.name, email: user.email },",
    "{\n          name: user.name,\n          email: user.email,\n          preferredLanguage: user.preferredLanguage,\n        },",
    1,
    "localized auth email payloads",
  );

  next = next.replace(
    /user: \{\n        id: user\.id,\n        name: user\.name,\n        email: user\.email,\n        businessId: user\.businessId,\n        vertical: user\.business\?\.vertical \?\? null,\n        timezone: user\.business\?\.timezone \?\? null,\n      \},/g,
    `user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessId: user.businessId,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
        vertical: user.business?.vertical ?? null,
        timezone: user.business?.timezone ?? null,
      },`,
  );

  next = next.replace(
    /user: \{\n        id: user\.id,\n        name: user\.name,\n        email: user\.email,\n        businessId: user\.businessId,\n      \},/g,
    `user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessId: user.businessId,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
      },`,
  );

  return next;
});
