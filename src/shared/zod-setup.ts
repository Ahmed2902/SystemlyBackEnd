/**
 * Zod + zod-to-openapi bootstrapping.
 *
 * This module MUST be imported as the very first thing in the application
 * entry point (app.ts) so that every subsequent module that uses `.openapi()`
 * on Zod schemas has access to the patched methods.
 */
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export { z };
