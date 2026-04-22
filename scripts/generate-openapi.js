/* eslint-disable no-console */
const SwaggerParser = require("@apidevtools/swagger-parser");
const path = require("path");

async function load() {
  const app = require(path.resolve(__dirname, "../dist/app.js")).default;
  const { getOpenApiDocument } = require(path.resolve(
    __dirname,
    "../dist/src/shared/docs/openapi.gen.js"
  ));
  const openApiDocument = getOpenApiDocument(app, {
    title: "Hgezli API",
    version: "1.0.0",
    url: process.env.APP_URL,
  });
  await SwaggerParser.validate(openApiDocument);
  console.log("OpenAPI generated document validated");
}

void load();
