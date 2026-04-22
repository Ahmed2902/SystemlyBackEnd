import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

const isProduction = process.env.NODE_ENV === "production";

if (!isProduction) {
  try {
    const cwdEnv = path.resolve(process.cwd(), ".env");
    const localEnv = path.resolve(__dirname, ".env");

    const envPath = fs.existsSync(cwdEnv)
      ? cwdEnv
      : fs.existsSync(localEnv)
      ? localEnv
      : null;

    if (envPath) {
      const result = dotenv.config({ path: envPath });
      dotenvExpand.expand(result);
    }
  } catch (err) {
    // fail silently — environment variables may already be provided by the platform
  }
}

export default {};
