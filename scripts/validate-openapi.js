const path = require("path");
const SwaggerParser = require("@apidevtools/swagger-parser");

async function run() {
  try {
    const distPath = path.join(
      process.cwd(),
      "dist",
      "src",
      "shared",
      "docs",
      "openapi.js"
    );
    const docModule = require(distPath);
    const openApiDocument =
      docModule.openApiDocument || docModule.default || docModule;

    console.log("Validating OpenAPI document from:", distPath);
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
