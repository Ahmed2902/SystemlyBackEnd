/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const SwaggerParser = require("@apidevtools/swagger-parser");

(async () => {
  const app = require(path.resolve(__dirname, "../dist/app.js")).default;
  const { getOpenApiDocument } = require(path.resolve(
    __dirname,
    "../dist/src/shared/docs/openapi.gen.js"
  ));
  const doc = getOpenApiDocument(app, {
    title: "Hgezli API",
    version: "1.0.0",
    url: process.env.APP_URL,
  });

  await SwaggerParser.validate(doc);
  const outPath = path.resolve(__dirname, "../openapi/openapi.full.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log("Written OpenAPI to", outPath);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
