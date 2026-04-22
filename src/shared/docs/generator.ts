import type { Application } from "express";
import { getOpenApiDocument } from "./openapi.gen";

export const generateOpenApi = (
  app: Application,
  base: { info?: { title?: string; version?: string }; servers?: Array<{ url: string }> }
) => {
  return getOpenApiDocument(app, {
    title: base.info?.title ?? "Hgezli API",
    version: base.info?.version ?? "1.0.0",
    url: base.servers?.[0]?.url,
  });
};

export default generateOpenApi;
