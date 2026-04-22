const path = require("path");
const SwaggerParser = require("@apidevtools/swagger-parser");

async function run() {
  try {
    const appPath = path.join(process.cwd(), "dist", "app.js");
    const docsPath = path.join(
      process.cwd(),
      "dist",
      "src",
      "shared",
      "docs",
      "openapi.gen.js"
    );
    const app = require(appPath).default;
    const { getOpenApiDocument } = require(docsPath);
    const openApiDocument = getOpenApiDocument(app, {
      title: "Hgezli API",
      version: "1.0.0",
      url: process.env.APP_URL,
    });

    console.log("Validating OpenAPI document from generated route metadata");
    await SwaggerParser.validate(openApiDocument);
    console.log("OpenAPI spec is valid.");
    process.exit(0);
  } catch (err) {
    console.error("OpenAPI validation failed:");
    console.error(err);
    process.exit(2);
  }
}

run();
